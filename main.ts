import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, verify } from "https://deno.land/x/djwt@v3.0.1/mod.ts";
import { extname } from "https://deno.land/std@0.208.0/path/mod.ts";

// Load environment variables
const DB_HOST = "127.0.0.1";
const DB_USER = "root";
const DB_PASSWORD = "mypassword";
const DB_NAME = "auth_db";
const DB_PORT = parseInt("3306");
const JWT_SECRET = "default-secret";
const PORT = parseInt("8000");

const simpleAuthMiddleware = async (ctx: any, next: () => Promise<unknown>) => {
  try {
    // For API endpoints, expect token in request body
    let auth_token = null;
    
    if (ctx.request.method === 'POST') {
      const body = await ctx.request.body();
      const bodyValue = await body.value;
      auth_token = bodyValue.auth_token;
    } else {
      // For GET requests, check query params
      auth_token = ctx.request.url.searchParams.get('auth_token');
    }

    if (!auth_token || !(await isAuthorized(auth_token))) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Unauthorized" };
      return;
    }

    // Get username from token and user data
    const username = tokens[auth_token];
    const users = await client.query(
      "SELECT id, username, is_admin FROM users WHERE username = ?",
      [username]
    );

    if (users.length > 0) {
      ctx.state.user = users[0];
      ctx.state.username = username;
    }

    await next();
  } catch (error) {
    console.error("❌ Auth middleware error:", error);
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized" };
  }
};

// Database connection
let client: Client;

async function connectToDatabase() {
  try {
    client = new Client();
    await client.connect({
      hostname: DB_HOST,
      username: DB_USER,
      password: DB_PASSWORD,
      db: DB_NAME,
      port: DB_PORT,
    });
    console.log("✅ Connected to MySQL database");
    return true;
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    console.log("💡 Make sure Docker MySQL is running:");
    console.log("   sudo docker ps");
    console.log("   sudo docker start mysql-auth");
    return false;
  }
}

// Database initialization
async function initializeDatabase() {
    try {
      // Create users table with admin column
      await client.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password VARCHAR(255) NOT NULL,
          is_admin BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
  
      // Create books table
      await client.execute(`
        CREATE TABLE IF NOT EXISTS books (
          id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          author VARCHAR(255) NOT NULL,
          publication_date DATE,
          genre VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
  
      // Create DVDs table
      await client.execute(`
        CREATE TABLE IF NOT EXISTS dvds (
          id INT AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          publication_date DATE,
          director VARCHAR(255) NOT NULL,
          genre VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
  
      // Create CDs table
      await client.execute(`
        CREATE TABLE IF NOT EXISTS cds (
          id INT AUTO_INCREMENT PRIMARY KEY,
          author VARCHAR(255) NOT NULL,
          publication_date DATE,
          genre VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
  
      // Create articles table (main marketplace table)
      await client.execute(`
        CREATE TABLE IF NOT EXISTS articles (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            item_type ENUM('book', 'dvd', 'cd') NOT NULL,
            item_id INT NOT NULL,
            description TEXT,
            price DECIMAL(10, 2) NOT NULL,
            is_sold BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_user_id (user_id),
            INDEX idx_item_type (item_type),
            INDEX idx_is_sold (is_sold)
            )
      `);
  
      console.log("✅ Database tables initialized");
      console.log("📚 Created tables: users, books, dvds, cds, articles");
    } catch (error) {
      console.error("❌ Database initialization error:", error.message);
      throw error;
    }
}

async function initializeChatTables() {
  try {
      // Drop existing table if you need to recreate it (optional - remove in production)
      // await client.execute(`DROP TABLE IF EXISTS chat_messages`);
      
      // Create chat messages table with proper structure
      await client.execute(`
          CREATE TABLE IF NOT EXISTS chat_messages (
              id INT AUTO_INCREMENT PRIMARY KEY,
              article_id INT NOT NULL,
              user_id INT NOT NULL,
              username VARCHAR(50) NOT NULL,
              message TEXT NOT NULL,
              timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE,
              FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
              INDEX idx_article_id (article_id),
              INDEX idx_user_id (user_id),
              INDEX idx_timestamp (timestamp)
          )
      `);

      console.log("✅ Chat tables initialized successfully");
      
      // Verify the table was created
      const tables = await client.query("SHOW TABLES LIKE 'chat_messages'");
      if (tables.length > 0) {
          console.log("✅ chat_messages table exists");
          
          // Check table structure
          const columns = await client.query("SHOW COLUMNS FROM chat_messages");
          console.log("📋 chat_messages columns:", columns.map((col: any) => col.Field).join(", "));
      }
  } catch (error) {
      console.error("❌ Chat tables initialization error:", error.message);
      throw error;
  }
}

// Connection related variables
const tokens: { [key: string]: string } = {};

// Function to remove a token based on the user
function removeTokenByUser(user: string) {
  for (const token in tokens) {
    if (tokens[token] === user) {
      delete tokens[token];
      break;
    }
  }
}

// Types
interface User {
    id?: number;
    username: string;
    password: string;
    is_admin?: boolean;
    created_at?: Date;
    updated_at?: Date;
  }
  
  interface Book {
    id?: number;
    title: string;
    author: string;
    publication_date?: Date;
    genre?: string;
  }
  
  interface DVD {
    id?: number;
    title: string;
    publication_date?: Date;
    director: string;
    genre?: string;
  }
  
  interface CD {
    id?: number;
    author: string;
    publication_date?: Date;
    genre?: string;
  }
  
  interface Article {
    id?: number;
    user_id: number;
    item_type: 'book' | 'dvd' | 'cd';
    item_id: number;
    description?: string;
    price: number;
    is_sold?: boolean;
    created_at?: Date;
    updated_at?: Date;
  }
  
  interface JWTPayload {
    userId: number;
    username: string;
    isAdmin: boolean;
    tokenId: string;
    iat: number;
    exp: number;
  }

  interface ChatMessage {
    id?: number;
    article_id: number;
    user_id: number;
    username: string;
    message: string;
    timestamp: string;
    created_at?: Date;
}

interface WebSocketClient {
  ws: WebSocket;
  userId: number;
  username: string;
  articleId: number;
  chatRoomId?: string; // Add this optional property
}


class ChatManager {
  private clients: Map<string, WebSocketClient> = new Map();
  private rooms: Map<string, Set<string>> = new Map();

  addClient(clientId: string, client: WebSocketClient) {
      this.clients.set(clientId, client);
      
      const roomKey = client.chatRoomId || client.articleId.toString();
      
      if (!this.rooms.has(roomKey)) {
          this.rooms.set(roomKey, new Set());
      }
      this.rooms.get(roomKey)!.add(clientId);

      console.log(`📞 User ${client.username} (${clientId}) joined room ${roomKey}`);
      console.log(`📊 Room ${roomKey} now has ${this.rooms.get(roomKey)!.size} users`);
      
      // Log all clients in the room
      const roomClients = Array.from(this.rooms.get(roomKey)!).map(id => {
          const c = this.clients.get(id);
          return c ? `${c.username}(${c.userId})` : 'unknown';
      });
      console.log(`👥 Users in room ${roomKey}: ${roomClients.join(', ')}`);
  }

  removeClient(clientId: string) {
      const client = this.clients.get(clientId);
      if (client) {
          const roomKey = client.chatRoomId || client.articleId.toString();
          
          const room = this.rooms.get(roomKey);
          if (room) {
              room.delete(clientId);
              if (room.size === 0) {
                  this.rooms.delete(roomKey);
              }
              console.log(`📊 Room ${roomKey} now has ${room.size} users`);
          }
          
          this.clients.delete(clientId);
          console.log(`📞 User ${client.username} (${clientId}) left room ${roomKey}`);
      }
  }

  broadcastToRoom(roomKey: string | number, message: any, excludeClientId?: string) {
      const roomKeyStr = roomKey.toString();
      const room = this.rooms.get(roomKeyStr);
      
      console.log(`📢 Broadcasting to room ${roomKeyStr}: ${message.type}`);
      console.log(`📊 Room has ${room ? room.size : 0} clients`);
      
      if (!room || room.size === 0) {
          console.log(`⚠️ No clients in room ${roomKeyStr}`);
          return;
      }

      const messageStr = JSON.stringify(message);
      let sentCount = 0;
      
      room.forEach(clientId => {
          if (clientId === excludeClientId) {
              console.log(`⏭️ Skipping sender ${clientId}`);
              return;
          }
          
          const client = this.clients.get(clientId);
          if (client && client.ws.readyState === WebSocket.OPEN) {
              try {
                  client.ws.send(messageStr);
                  sentCount++;
                  console.log(`✉️ Sent to ${client.username} (${clientId})`);
              } catch (error) {
                  console.error(`❌ Error sending to ${clientId}:`, error);
                  this.removeClient(clientId);
              }
          } else {
              console.log(`⚠️ Client ${clientId} not ready or disconnected`);
          }
      });
      
      console.log(`📢 Broadcast complete: sent to ${sentCount} clients`);
  }

  async saveMessage(message: ChatMessage): Promise<number> {
      try {
          console.log(`💾 Attempting to save message:`, message);
          
          // Ensure timestamp is properly formatted for MySQL
          const formattedTimestamp = new Date(message.timestamp).toISOString().slice(0, 19).replace('T', ' ');
          
          const result = await client.execute(
              "INSERT INTO chat_messages (article_id, user_id, username, message, timestamp) VALUES (?, ?, ?, ?, ?)",
              [message.article_id, message.user_id, message.username, message.message, formattedTimestamp]
          );
          
          const messageId = result.lastInsertId as number;
          console.log(`✅ Message saved with ID: ${messageId}`);
          return messageId;
      } catch (error) {
          console.error('❌ Error saving message:', error);
          console.error('Message data:', message);
          throw error;
      }
  }

  async getMessageHistory(articleId: number, limit: number = 50): Promise<ChatMessage[]> {
      try {
          console.log(`📜 Loading message history for article ${articleId} (limit: ${limit})`);
          
          const messages = await client.query(
              "SELECT * FROM chat_messages WHERE article_id = ? ORDER BY timestamp DESC LIMIT ?",
              [articleId, limit]
          );
          
          const formattedMessages = messages.reverse().map((msg: any) => ({
              id: msg.id,
              article_id: msg.article_id,
              user_id: msg.user_id,
              username: msg.username,
              message: msg.message,
              timestamp: msg.timestamp
          }));
          
          console.log(`📜 Loaded ${formattedMessages.length} messages`);
          return formattedMessages;
      } catch (error) {
          console.error('❌ Error getting message history:', error);
          return [];
      }
  }
}

const chatManager = new ChatManager();

// Create a proper crypto key for JWT
const secretKey = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-512" },
    true,
    ["sign", "verify"]
);

// Function to check the tokens received by websocket messages
const isAuthorized = async (auth_token: string) => {
  if (!auth_token) {
    return false;
  }
  if (auth_token in tokens) {
    try {
      const payload = await verify(auth_token, secretKey);
      if (payload.userName === tokens[auth_token]) {
        return true;
      }
    } catch {
      console.log("verify token failed");
      return false;
    }
  }
  console.log("Unknown token");
  return false;
};

// Helper functions
function generateJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
  const fullPayload: JWTPayload = {
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (2 * 60 * 60), // 2 hours
  };
  return create({ alg: "HS512", typ: "JWT" }, fullPayload, secretKey);
}


// Router setup
const router = new Router();

// Register endpoint
router.post("/api/auth/register", async (ctx) => {
  try {
    const body = await ctx.request.body();
    const { username, password } = await body.value;

    console.log(`📝 Registration attempt for: ${username}`);

    // Validation
    if (!username || !password) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Username and password are required" };
      return;
    }

    if (username.length < 3) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Username must be at least 3 characters long" };
      return;
    }

    if (password.length < 6) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Password must be at least 6 characters long" };
      return;
    }

    // Check if user already exists
    const existingUser = await client.query(
      "SELECT id FROM users WHERE username = ?",
      [username]
    );

    if (existingUser.length > 0) {
      console.log(`❌ Registration failed: Username already exists - ${username}`);
      ctx.response.status = 409;
      ctx.response.body = { error: "Username already exists" };
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password);

    // Insert user
    const result = await client.execute(
      "INSERT INTO users (username, password, is_admin) VALUES (?, ?, ?)",
      [username, hashedPassword, false]
    );

    const userId = result.lastInsertId as number;
    const sessionId = generateSessionId();

    // Generate JWT
    const token = await generateJWT({
      userId,
      username,
      sessionId,
      isAdmin: false
    });

    // Set secure cookie
    const isProduction = Deno.env.get('NODE_ENV') === 'production';
    const cookieOptions = [
      `auth_token=${token}`,
      'HttpOnly',
      'SameSite=Strict',
      'Max-Age=7200', // 2 hours
      'Path=/',
      ...(isProduction ? ['Secure'] : [])
    ].join('; ');

    ctx.response.headers.set("Set-Cookie", cookieOptions);

    console.log(`✅ User registered successfully: ${username} (ID: ${userId})`);

    ctx.response.status = 201;
    ctx.response.body = {
      message: "User registered successfully",
      user: {
        id: userId,
        username,
        isAdmin: false
      },
    };
  } catch (error) {
    console.error("❌ Registration error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error: " + error.message };
  }
});

router.get("/uploads/:filename", async (ctx) => {
  const filename = ctx.params.filename;
  const filePath = `./uploads/${filename}`;
  
  console.log(`🖼️ Image request: ${filename}`);
  
  try {
    // Read file
    const fileContent = await Deno.readFile(filePath);
    
    // Get file extension for content type
    const ext = filename.toLowerCase().split('.').pop() || 'jpg';
    let contentType = 'image/jpeg';
    
    switch (ext) {
      case 'png': contentType = 'image/png'; break;
      case 'gif': contentType = 'image/gif'; break;
      case 'webp': contentType = 'image/webp'; break;
      case 'jpg':
      case 'jpeg': 
      default: contentType = 'image/jpeg'; break;
    }
    
    // Set headers
    ctx.response.headers.set("Content-Type", contentType);
    ctx.response.headers.set("Content-Length", fileContent.length.toString());
    ctx.response.headers.set("Cache-Control", "public, max-age=3600");
    
    // CORS headers
    ctx.response.headers.set("Access-Control-Allow-Origin", "*");
    ctx.response.headers.set("Access-Control-Allow-Methods", "GET");
    
    ctx.response.body = fileContent;
    console.log(`✅ Served image: ${filename} (${contentType}, ${fileContent.length} bytes)`);
    
  } catch (error) {
    console.log(`❌ Image not found: ${filename}`);
    ctx.response.status = 404;
    ctx.response.body = "Image not found";
  }
});

router.options("/uploads/:filename", (ctx) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "*");
  ctx.response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Cache-Control");
  ctx.response.status = 200;
  ctx.response.body = "";
});

// Login endpoint
router.post("/api/auth/login", async (ctx) => {
  try {
    const body = await ctx.request.body();
    const { username, password } = await body.value;
    
    console.log(`🔐 Login attempt for: ${username}`);

    // Find user in database
    const users = await client.query(
      "SELECT id, username, password, is_admin FROM users WHERE username = ?",
      [username]
    );

    if (users.length === 0) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid username or password" };
      return;
    }

    const user = users[0] as any;

    // Verify password
    const result = await bcrypt.compare(password, user.password);
    if (!result) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid username or password" };
      return;
    }

    // Create token - exactly like your example
    const token = await create(
      { alg: "HS512", typ: "JWT" }, 
      { userName: user.username }, 
      secretKey
    );

    // Remove existing token and store new one - exactly like your example
    removeTokenByUser(username);
    tokens[token] = username;

    console.log(`✅ User logged in: ${username}`);
    console.log(`📊 Active tokens: ${Object.keys(tokens).length}`);

    ctx.response.status = 200;
    ctx.response.body = { 
      auth_token: token,
      user: {
        id: user.id,
        username: user.username,
        isAdmin: Boolean(user.is_admin)
      }
    };
  } catch (error) {
    console.error("❌ Login error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Logout endpoint
router.post("/api/auth/logout", async (ctx) => {
  try {
    const body = await ctx.request.body();
    const { auth_token } = await body.value;

    if (auth_token && auth_token in tokens) {
      const username = tokens[auth_token];
      delete tokens[auth_token];
      console.log(`👋 User logged out: ${username}`);
    }

    ctx.response.body = { message: "Logout successful" };
  } catch (error) {
    console.error("❌ Logout error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

router.post("/api/auth/profile", async (ctx) => {
  try {
    const body = await ctx.request.body();
    const { auth_token } = await body.value;

    if (!auth_token || !(await isAuthorized(auth_token))) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Unauthorized" };
      return;
    }

    const username = tokens[auth_token];
    const users = await client.query(
      "SELECT id, username, is_admin FROM users WHERE username = ?",
      [username]
    );

    if (users.length === 0) {
      ctx.response.status = 401;
      ctx.response.body = { error: "User not found" };
      return;
    }

    const user = users[0];
    ctx.response.body = {
      message: "Profile retrieved successfully",
      user: {
        id: user.id,
        username: user.username,
        isAdmin: Boolean(user.is_admin)
      }
    };
  } catch (error) {
    console.error("❌ Profile error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

router.get("/api/auth/sessions", tokenAuthMiddleware, (ctx) => {
  try {
    const tokenData = ctx.state.tokenData;
    
    if (!tokenData.isAdmin) {
      ctx.response.status = 403;
      ctx.response.body = { error: "Forbidden: Admin access required" };
      return;
    }
    
    const sessions = Object.entries(tokens).map(([token, info]) => ({
      tokenId: token.substring(0, 20) + "...", // Don't expose full token
      userId: info.userId,
      username: info.username,
      isAdmin: info.isAdmin,
      loginTime: info.loginTime,
      lastActivity: info.lastActivity,
      isCurrentUser: info.username === tokenData.username
    }));
    
    ctx.response.body = {
      message: "Active sessions retrieved",
      sessions,
      totalSessions: sessions.length
    };
  } catch (error) {
    console.error("❌ Sessions retrieval error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

router.post("/api/auth/validate", async (ctx) => {
  try {
    const body = await ctx.request.body();
    const { auth_token } = await body.value;
    
    if (!auth_token) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Token is required" };
      return;
    }
    
    const isValid = await isAuthorized(auth_token);
    
    if (isValid) {
      const tokenInfo = tokens[auth_token];
      ctx.response.body = {
        valid: true,
        user: {
          userId: tokenInfo.userId,
          username: tokenInfo.username,
          isAdmin: tokenInfo.isAdmin
        }
      };
    } else {
      ctx.response.body = { valid: false };
    }
  } catch (error) {
    console.error("❌ Token validation error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

router.get("/api/health", (ctx) => {
  ctx.response.body = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    database: client ? "connected" : "disconnected",
    activeTokens: Object.keys(tokens).length
  };
});

router.get("/api/debug/tokens", (ctx) => {
  ctx.response.body = {
    tokenCount: Object.keys(tokens).length,
    tokenUsers: Object.values(tokens) // Just show usernames, not actual tokens
  };
});

router.get("/api/test-cookie", tokenAuthMiddleware, (ctx) => {
  const tokenData = ctx.state.tokenData as JWTPayload;
  ctx.response.body = { 
    message: 'Token verified successfully', 
    tokenData: {
      userId: tokenData.userId,
      username: tokenData.username,
      isAdmin: tokenData.isAdmin,
      sessionId: tokenData.sessionId,
      exp: tokenData.exp
    }
  };
});

// Create a book
router.post("/api/books", simpleAuthMiddleware, async (ctx) => {
  try {
    const body = await ctx.request.body();
    const { title, author, publication_date, genre, auth_token } = await body.value;

    if (!title || !author) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Title and author are required" };
      return;
    }

    const result = await client.execute(
      "INSERT INTO books (title, author, publication_date, genre) VALUES (?, ?, ?, ?)",
      [title, author, publication_date || null, genre || null]
    );

    ctx.response.status = 201;
    ctx.response.body = {
      message: "Book created successfully",
      book: {
        id: result.lastInsertId,
        title,
        author,
        publication_date,
        genre,
      },
    };
  } catch (error) {
    console.error("❌ Book creation error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});
// Create a DVD
router.post("/api/dvds", simpleAuthMiddleware, async (ctx) => {
  try {
    const body = await ctx.request.body();
    const { title, publication_date, director, genre, auth_token } = await body.value;

    if (!title || !director) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Title and director are required" };
      return;
    }

    const result = await client.execute(
      "INSERT INTO dvds (title, publication_date, director, genre) VALUES (?, ?, ?, ?)",
      [title, publication_date || null, director, genre || null]
    );

    ctx.response.status = 201;
    ctx.response.body = {
      message: "DVD created successfully",
      dvd: {
        id: result.lastInsertId,
        title,
        publication_date,
        director,
        genre,
      },
    };
  } catch (error) {
    console.error("❌ DVD creation error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Create a CD
router.post("/api/cds", simpleAuthMiddleware, async (ctx) => {
  try {
    const body = await ctx.request.body();
    const { author, publication_date, genre, auth_token } = await body.value;

    if (!author) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Author is required" };
      return;
    }

    const result = await client.execute(
      "INSERT INTO cds (author, publication_date, genre) VALUES (?, ?, ?)",
      [author, publication_date || null, genre || null]
    );

    ctx.response.status = 201;
    ctx.response.body = {
      message: "CD created successfully",
      cd: {
        id: result.lastInsertId,
        author,
        publication_date,
        genre,
      },
    };
  } catch (error) {
    console.error("❌ CD creation error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Create an article
router.post("/api/articles", simpleAuthMiddleware, async (ctx) => {
  try {
    const user = ctx.state.user;
    
    const body = await ctx.request.body();
    const bodyValue = await body.value;
    const { item_type, item_id, description, price, auth_token } = bodyValue;
    
    console.log('📝 Creating article:', { item_type, item_id, description, price });
    
    // Validation
    if (!item_type || !item_id || price === undefined || price === null) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Item type, item ID, and price are required" };
      return;
    }

    if (!['book', 'dvd', 'cd'].includes(item_type)) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Item type must be 'book', 'dvd', or 'cd'" };
      return;
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Price must be a valid number greater than 0" };
      return;
    }

    // Verify that the item exists
    let itemExists = false;
    try {
      if (item_type === 'book') {
        const books = await client.query("SELECT id FROM books WHERE id = ?", [item_id]);
        itemExists = books.length > 0;
      } else if (item_type === 'dvd') {
        const dvds = await client.query("SELECT id FROM dvds WHERE id = ?", [item_id]);
        itemExists = dvds.length > 0;
      } else if (item_type === 'cd') {
        const cds = await client.query("SELECT id FROM cds WHERE id = ?", [item_id]);
        itemExists = cds.length > 0;
      }
    } catch (dbError) {
      console.error("❌ Database error checking item:", dbError);
      ctx.response.status = 500;
      ctx.response.body = { error: "Database error while verifying item" };
      return;
    }

    if (!itemExists) {
      ctx.response.status = 404;
      ctx.response.body = { error: `${item_type} with ID ${item_id} not found` };
      return;
    }

    // Create the article
    try {
      const result = await client.execute(
        "INSERT INTO articles (user_id, item_type, item_id, description, price) VALUES (?, ?, ?, ?, ?)",
        [user.id, item_type, item_id, description || null, priceNum]
      );

      console.log(`✅ Article created successfully: ID ${result.lastInsertId}`);

      ctx.response.status = 201;
      ctx.response.body = {
        message: "Article created successfully",
        article: {
          id: result.lastInsertId,
          user_id: user.id,
          item_type,
          item_id,
          description: description || null,
          price: priceNum,
          is_sold: false,
          created_at: new Date().toISOString()
        },
      };
    } catch (dbError) {
      console.error("❌ Database error creating article:", dbError);
      ctx.response.status = 500;
      ctx.response.body = { error: "Database error while creating article" };
      return;
    }
    
  } catch (error) {
    console.error("❌ Article creation error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error: " + error.message };
  }
});



router.get("/uploads/:filename", async (ctx) => {
  try {
      const filename = ctx.params.filename;
      const filePath = `${UPLOADS_DIR}/${filename}`;
      
      // Check if file exists
      try {
          const fileInfo = await Deno.stat(filePath);
          if (!fileInfo.isFile) {
              ctx.response.status = 404;
              ctx.response.body = { error: "File not found" };
              return;
          }
      } catch {
          ctx.response.status = 404;
          ctx.response.body = { error: "File not found" };
          return;
      }

      // Determine content type based on file extension
      const ext = extname(filename).toLowerCase();
      const contentTypes: { [key: string]: string } = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp'
      };

      const contentType = contentTypes[ext] || 'application/octet-stream';
      
      // Read and serve the file
      const fileContent = await Deno.readFile(filePath);
      
      ctx.response.headers.set("Content-Type", contentType);
      ctx.response.headers.set("Cache-Control", "public, max-age=31536000"); // Cache for 1 year
      ctx.response.body = fileContent;
  } catch (error) {
      console.error("❌ File serving error:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error" };
  }
});

// Add cleanup function for old files (optional)
export async function cleanupOldFiles(daysOld: number = 30) {
  try {
      const cutoffTime = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
      
      for await (const dirEntry of Deno.readDir(UPLOADS_DIR)) {
          if (dirEntry.isFile) {
              const filePath = `${UPLOADS_DIR}/${dirEntry.name}`;
              const fileInfo = await Deno.stat(filePath);
              
              if (fileInfo.mtime && fileInfo.mtime.getTime() < cutoffTime) {
                  console.log(`🗑️ Cleaning up old file: ${dirEntry.name}`);
                  await Deno.remove(filePath);
              }
          }
      }
  } catch (error) {
      console.error("❌ Cleanup error:", error);
  }
}

router.get("/test_cookie", async (ctx) => {
  try {
    // Get token from query params for GET request
    const auth_token = ctx.request.url.searchParams.get('auth_token');

    if (!auth_token || !(await isAuthorized(auth_token))) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Unauthorized" };
      return;
    }

    const username = tokens[auth_token];
    const users = await client.query(
      "SELECT id, username, is_admin FROM users WHERE username = ?",
      [username]
    );

    if (users.length === 0) {
      ctx.response.status = 401;
      ctx.response.body = { error: "User not found" };
      return;
    }

    const user = users[0];
    ctx.response.body = { 
      message: 'Token verified successfully', 
      token_data: {
        userId: user.id,
        username: user.username,
        isAdmin: Boolean(user.is_admin)
      }
    };
  } catch (error) {
    console.error("❌ Test cookie error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Fixed CD articles endpoints - replace the existing ones in your main.ts

// Get all CD articles with CD information
router.get("/api/articles/cd", async (ctx) => {
    try {
      const articles = await client.query(`
        SELECT 
          a.id,
          a.user_id,
          a.item_type,
          a.item_id,
          a.description,
          a.price,
          a.is_sold,
          a.created_at,
          a.updated_at,
          c.author,
          c.publication_date,
          c.genre,
          u.username as seller_username
        FROM articles a
        JOIN cds c ON a.item_id = c.id
        JOIN users u ON a.user_id = u.id
        WHERE a.item_type = 'cd'
        ORDER BY a.created_at DESC
      `);
  
      const formattedArticles = articles.map((article: any) => ({
        id: article.id,
        user_id: article.user_id,
        item_type: article.item_type,
        item_id: article.item_id,
        description: article.description,
        price: parseFloat(article.price),
        is_sold: Boolean(article.is_sold),
        created_at: article.created_at,
        updated_at: article.updated_at,
        seller_username: article.seller_username,
        cd_info: {
          author: article.author,
          publication_date: article.publication_date,
          genre: article.genre
        }
      }));
  
      ctx.response.body = {
        message: "CD articles retrieved successfully",
        articles: formattedArticles
      };
    } catch (error) {
      console.error("❌ CD articles retrieval error:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error" };
    }
  });
  
// Get a specific CD article by ID
router.get("/api/articles/cd/:id", async (ctx) => {
  try {
    const articleId = ctx.params.id;
    
    // Validate articleId is a number
    if (!articleId || isNaN(Number(articleId))) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Invalid article ID" };
      return;
    }
    
    const articles = await client.query(`
      SELECT 
        a.id,
        a.user_id,
        a.item_type,
        a.item_id,
        a.description,
        a.price,
        a.is_sold,
        a.created_at,
        a.updated_at,
        c.author,
        c.publication_date,
        c.genre,
        u.username as seller_username
      FROM articles a
      JOIN cds c ON a.item_id = c.id
      JOIN users u ON a.user_id = u.id
      WHERE a.item_type = 'cd' AND a.id = ?
    `, [parseInt(articleId)]);

    if (articles.length === 0) {
      ctx.response.status = 404;
      ctx.response.body = { error: "CD article not found" };
      return;
    }

    const article = articles[0] as any;
    const formattedArticle = {
      id: article.id,
      user_id: article.user_id,
      item_type: article.item_type,
      item_id: article.item_id,
      description: article.description,
      price: parseFloat(article.price),
      is_sold: Boolean(article.is_sold),
      created_at: article.created_at,
      updated_at: article.updated_at,
      seller_username: article.seller_username,
      cd_info: {
        author: article.author,
        publication_date: article.publication_date,
        genre: article.genre
      }
    };

    ctx.response.body = {
      message: "CD article retrieved successfully",
      article: formattedArticle
    };
  } catch (error) {
    console.error("❌ CD article retrieval error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Also fix the general articles endpoint for CDs
router.get("/api/articles", async (ctx) => {
  try {
    // Get books
    const bookArticles = await client.query(`
      SELECT 
        a.id,
        a.user_id,
        a.item_type,
        a.item_id,
        a.description,
        a.price,
        a.is_sold,
        a.created_at,
        a.updated_at,
        b.title,
        b.author,
        b.publication_date,
        b.genre,
        u.username as seller_username
      FROM articles a
      JOIN books b ON a.item_id = b.id
      JOIN users u ON a.user_id = u.id
      WHERE a.item_type = 'book'
    `);

    // Get DVDs
    const dvdArticles = await client.query(`
      SELECT 
        a.id,
        a.user_id,
        a.item_type,
        a.item_id,
        a.description,
        a.price,
        a.is_sold,
        a.created_at,
        a.updated_at,
        d.title,
        d.director,
        d.publication_date,
        d.genre,
        u.username as seller_username
      FROM articles a
      JOIN dvds d ON a.item_id = d.id
      JOIN users u ON a.user_id = u.id
      WHERE a.item_type = 'dvd'
    `);

    // Get CDs - Fixed to remove c.title
    const cdArticles = await client.query(`
      SELECT 
        a.id,
        a.user_id,
        a.item_type,
        a.item_id,
        a.description,
        a.price,
        a.is_sold,
        a.created_at,
        a.updated_at,
        c.author,
        c.publication_date,
        c.genre,
        u.username as seller_username
      FROM articles a
      JOIN cds c ON a.item_id = c.id
      JOIN users u ON a.user_id = u.id
      WHERE a.item_type = 'cd'
    `);

    // Format all articles with consistent structure
    const allArticles = [
      ...bookArticles.map((article: any) => ({
        id: article.id,
        user_id: article.user_id,
        item_type: article.item_type,
        item_id: article.item_id,
        description: article.description,
        price: parseFloat(article.price),
        is_sold: Boolean(article.is_sold),
        created_at: article.created_at,
        updated_at: article.updated_at,
        seller_username: article.seller_username,
        item_info: {
          title: article.title,
          author: article.author,
          publication_date: article.publication_date,
          genre: article.genre
        }
      })),
      ...dvdArticles.map((article: any) => ({
        id: article.id,
        user_id: article.user_id,
        item_type: article.item_type,
        item_id: article.item_id,
        description: article.description,
        price: parseFloat(article.price),
        is_sold: Boolean(article.is_sold),
        created_at: article.created_at,
        updated_at: article.updated_at,
        seller_username: article.seller_username,
        item_info: {
          title: article.title,
          director: article.director,
          publication_date: article.publication_date,
          genre: article.genre
        }
      })),
      ...cdArticles.map((article: any) => ({
        id: article.id,
        user_id: article.user_id,
        item_type: article.item_type,
        item_id: article.item_id,
        description: article.description,
        price: parseFloat(article.price),
        is_sold: Boolean(article.is_sold),
        created_at: article.created_at,
        updated_at: article.updated_at,
        seller_username: article.seller_username,
        item_info: {
          // For CDs, we only have author, not title
          author: article.author,
          publication_date: article.publication_date,
          genre: article.genre
        }
      }))
    ];

    // Sort by creation date (newest first)
    allArticles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    ctx.response.body = {
      message: "All articles retrieved successfully",
      articles: allArticles
    };
  } catch (error) {
    console.error("❌ All articles retrieval error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});


// Add these endpoints to your main.ts file, after the existing CD endpoints

// Get all book articles with book information
router.get("/api/articles/book", async (ctx) => {
    try {
      const articles = await client.query(`
        SELECT 
          a.id,
          a.user_id,
          a.item_type,
          a.item_id,
          a.description,
          a.price,
          a.is_sold,
          a.created_at,
          a.updated_at,
          b.title,
          b.author,
          b.publication_date,
          b.genre,
          u.username as seller_username
        FROM articles a
        JOIN books b ON a.item_id = b.id
        JOIN users u ON a.user_id = u.id
        WHERE a.item_type = 'book'
        ORDER BY a.created_at DESC
      `);
  
      const formattedArticles = articles.map((article: any) => ({
        id: article.id,
        user_id: article.user_id,
        item_type: article.item_type,
        item_id: article.item_id,
        description: article.description,
        price: parseFloat(article.price),
        is_sold: Boolean(article.is_sold),
        created_at: article.created_at,
        updated_at: article.updated_at,
        seller_username: article.seller_username,
        book_info: {
          title: article.title,
          author: article.author,
          publication_date: article.publication_date,
          genre: article.genre
        }
      }));
  
      ctx.response.body = {
        message: "Book articles retrieved successfully",
        articles: formattedArticles
      };
    } catch (error) {
      console.error("❌ Book articles retrieval error:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error" };
    }
});

// Get all DVD articles with DVD information
router.get("/api/articles/dvd", async (ctx) => {
    try {
      const articles = await client.query(`
        SELECT 
          a.id,
          a.user_id,
          a.item_type,
          a.item_id,
          a.description,
          a.price,
          a.is_sold,
          a.created_at,
          a.updated_at,
          d.title,
          d.director,
          d.publication_date,
          d.genre,
          u.username as seller_username
        FROM articles a
        JOIN dvds d ON a.item_id = d.id
        JOIN users u ON a.user_id = u.id
        WHERE a.item_type = 'dvd'
        ORDER BY a.created_at DESC
      `);
  
      const formattedArticles = articles.map((article: any) => ({
        id: article.id,
        user_id: article.user_id,
        item_type: article.item_type,
        item_id: article.item_id,
        description: article.description,
        price: parseFloat(article.price),
        is_sold: Boolean(article.is_sold),
        created_at: article.created_at,
        updated_at: article.updated_at,
        seller_username: article.seller_username,
        dvd_info: {
          title: article.title,
          director: article.director,
          publication_date: article.publication_date,
          genre: article.genre
        }
      }));
  
      ctx.response.body = {
        message: "DVD articles retrieved successfully",
        articles: formattedArticles
      };
    } catch (error) {
      console.error("❌ DVD articles retrieval error:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error" };
    }
});

// Replace the handleWebSocketConnection function in your main.ts with this fixed version

async function handleChatWebSocket(ctx: any) {
  console.log("🔌 Chat WebSocket connection attempt:", ctx.request.url.toString());
  
  try {
      const url = ctx.request.url;
      console.log("🔍 Full URL:", url.toString());
      console.log("🔍 Pathname:", url.pathname);
      
      // Fix URL parsing - expect /ws/chat/{chatRoomId}
      const pathParts = url.pathname.split('/');
      console.log("🔍 Path parts:", pathParts);
      
      // pathParts should be: ['', 'ws', 'chat', '{chatRoomId}']
      if (pathParts.length < 4 || pathParts[1] !== 'ws' || pathParts[2] !== 'chat') {
          console.log("❌ Invalid WebSocket path format");
          ctx.response.status = 400;
          ctx.response.body = { error: 'Invalid path format' };
          return;
      }
      
      const chatRoomId = pathParts[3]; // Keep as string
      const userId = parseInt(url.searchParams.get('userId') || '0');
      
      console.log(`🔌 WebSocket params - ChatRoom: ${chatRoomId}, User: ${userId}`);
      
      if (!chatRoomId || !userId || isNaN(userId)) {
          console.log("❌ Invalid WebSocket parameters");
          ctx.response.status = 400;
          ctx.response.body = { error: 'Invalid parameters' };
          return;
      }

      // Handle different types of chat rooms
      let isDirectChat = false;
      let articleId: number | null = null;
      
      if (chatRoomId.startsWith('direct_')) {
          // Direct chat
          isDirectChat = true;
          console.log(`✅ Direct chat room: ${chatRoomId}`);
      } else {
          // Article-based chat
          articleId = parseInt(chatRoomId);
          if (!articleId || isNaN(articleId)) {
              console.log(`❌ Invalid article ID: ${chatRoomId}`);
              ctx.response.status = 400;
              ctx.response.body = { error: 'Invalid article ID' };
              return;
          }
          
          // Verify article exists
          try {
              const articles = await client.query("SELECT id FROM articles WHERE id = ?", [articleId]);
              if (articles.length === 0) {
                  console.log(`❌ Article not found: ${articleId}`);
                  ctx.response.status = 404;
                  ctx.response.body = { error: 'Article not found' };
                  return;
              }
              console.log(`✅ Article found: ${articleId}`);
          } catch (error) {
              console.error('❌ Error checking article:', error);
              ctx.response.status = 500;
              ctx.response.body = { error: 'Database error' };
              return;
          }
      }

      // Get user info
      let username = '';
      try {
          const users = await client.query("SELECT username FROM users WHERE id = ?", [userId]);
          if (users.length === 0) {
              console.log(`❌ User not found: ${userId}`);
              ctx.response.status = 404;
              ctx.response.body = { error: 'User not found' };
              return;
          }
          username = users[0].username;
          console.log(`✅ User found: ${username} (${userId})`);
      } catch (error) {
          console.error('❌ Error getting user info:', error);
          ctx.response.status = 500;
          ctx.response.body = { error: 'Database error' };
          return;
      }

      // Use Oak's WebSocket upgrade method
      const socket = ctx.upgrade();
      const clientId = `${userId}_${chatRoomId}_${Date.now()}`;
      let clientData: WebSocketClient;

      socket.onopen = () => {
          console.log(`🔌 WebSocket opened for ${username} in room ${chatRoomId}`);
          clientData = {
              ws: socket,
              userId,
              username,
              articleId: articleId || 0, // Use 0 for direct chats
              chatRoomId // Add this property to track room
          };
          
          chatManager.addClient(clientId, clientData);
          
          // Send connection confirmation
          socket.send(JSON.stringify({
              type: 'connected',
              message: 'Successfully connected to chat',
              chatRoomId,
              isDirectChat
          }));
          
          // Send message history (only for article-based chats for now)
          if (!isDirectChat && articleId) {
              chatManager.getMessageHistory(articleId).then(history => {
                  if (socket.readyState === WebSocket.OPEN) {
                      socket.send(JSON.stringify({
                          type: 'history',
                          messages: history
                      }));
                      console.log(`📜 Sent ${history.length} messages from history to ${username}`);
                  }
              }).catch(error => {
                  console.error('Error sending message history:', error);
                  socket.send(JSON.stringify({
                      type: 'error',
                      message: 'Failed to load message history'
                  }));
              });
          } else if (isDirectChat) {
              // For direct chats, send empty history or implement direct chat history if needed
              socket.send(JSON.stringify({
                  type: 'history',
                  messages: [] // Empty for now, implement direct chat history storage if needed
              }));
              console.log(`📜 Direct chat initialized for ${username}`);
          }

          // Notify others that user joined
          chatManager.broadcastToRoom(chatRoomId, {
              type: 'user_joined',
              username,
              userId,
              chatRoomId,
              isDirectChat
          }, clientId);
      };

      socket.onmessage = async (event) => {
          try {
              console.log(`📨 Raw message from ${username}:`, event.data);
              const data = JSON.parse(event.data);
              console.log(`📨 Parsed message from ${username}:`, data.type, data);
              
              switch (data.type) {
                  case 'join':
                      // Already handled in onopen, just acknowledge
                      socket.send(JSON.stringify({
                          type: 'joined',
                          message: 'Successfully joined chat room',
                          chatRoomId,
                          isDirectChat
                      }));
                      break;
                      
                      case 'message':
                        if (data.message && data.message.trim()) {
                            if (isDirectChat) {
                                // For direct chats, broadcast without saving to database
                                const message = {
                                    type: 'message',
                                    userId,
                                    username,
                                    message: data.message.trim(),
                                    timestamp: new Date().toISOString(),
                                    chatRoomId,
                                    isDirectChat: true
                                };
                    
                                console.log(`💬 Broadcasting direct message from ${username} in room ${chatRoomId}`);
                    
                                // Send to all clients in room INCLUDING sender
                                chatManager.broadcastToRoom(chatRoomId, message);
                                
                            } else if (articleId) {
                                // Article-based chat - save to database
                                const message: ChatMessage = {
                                    article_id: articleId,
                                    user_id: userId,
                                    username,
                                    message: data.message.trim(),
                                    timestamp: new Date().toISOString()
                                };
                    
                                console.log(`💾 Saving message from ${username}:`, message.message);
                    
                                try {
                                    const messageId = await chatManager.saveMessage(message);
                                    message.id = messageId;
                    
                                    console.log(`💾 Saved message ${messageId} from ${username}`);
                    
                                    // Broadcast to ALL clients in room INCLUDING sender
                                    const broadcastMessage = {
                                        type: 'message',
                                        ...message,
                                        userId: message.user_id, // Ensure userId is included
                                        isDirectChat: false
                                    };
                                    
                                    chatManager.broadcastToRoom(chatRoomId, broadcastMessage);
                                    
                                } catch (error) {
                                    console.error('❌ Error saving message:', error);
                                    socket.send(JSON.stringify({
                                        type: 'error',
                                        message: 'Failed to save message. ' + error.message
                                    }));
                                }
                            }
                        }
                        break;

                  case 'typing':
                      chatManager.broadcastToRoom(chatRoomId, {
                          type: 'typing',
                          username,
                          userId,
                          chatRoomId
                      }, clientId);
                      break;

                  case 'stop_typing':
                      chatManager.broadcastToRoom(chatRoomId, {
                          type: 'stop_typing',
                          username,
                          userId,
                          chatRoomId
                      }, clientId);
                      break;

                  default:
                      console.log('❓ Unknown message type:', data.type);
                      socket.send(JSON.stringify({
                          type: 'error',
                          message: `Unknown message type: ${data.type}`
                      }));
              }
          } catch (error) {
              console.error('❌ Error handling WebSocket message:', error);
              socket.send(JSON.stringify({
                  type: 'error',
                  message: 'Invalid message format'
              }));
          }
      };

      socket.onclose = (event) => {
          console.log(`🔌 WebSocket closed for ${username} (Code: ${event.code}, Reason: ${event.reason})`);
          if (clientData) {
              chatManager.broadcastToRoom(chatRoomId, {
                  type: 'user_left',
                  username,
                  userId,
                  chatRoomId
              }, clientId);
          }
          chatManager.removeClient(clientId);
      };

      socket.onerror = (error) => {
          console.error(`❌ WebSocket error for user ${username}:`, error);
          chatManager.removeClient(clientId);
      };
      
  } catch (error) {
      console.error('❌ Error in chat WebSocket handler:', error);
      ctx.response.status = 500;
      ctx.response.body = { error: "WebSocket connection failed", details: error.message };
  }
}

function generateSessionId(): string {
  return crypto.randomUUID();
}


function cleanupExpiredTokens() {
  const now = new Date();
  const tokensToRemove: string[] = [];
  
  for (const [token, userInfo] of Object.entries(tokens)) {
    const inactiveTime = now.getTime() - userInfo.lastActivity.getTime();
    // Remove tokens inactive for more than 2 hours
    if (inactiveTime > 2 * 60 * 60 * 1000) {
      tokensToRemove.push(token);
    }
  }
  
  tokensToRemove.forEach(token => {
    const userInfo = tokens[token];
    delete tokens[token];
    console.log(`🧹 Cleaned up expired token for: ${userInfo.username}`);
  });
  
  console.log(`📊 Active tokens after cleanup: ${Object.keys(tokens).length}`);
}


setInterval(cleanupExpiredTokens, 30 * 60 * 1000);


function generateTokenId(): string {
  return `${Date.now()}_${crypto.randomUUID()}`;
}

async function tokenAuthMiddleware(ctx: any, next: () => Promise<unknown>) {
  try {
    // Try to get token from Authorization header first
    let authToken = ctx.request.headers.get("authorization");
    if (authToken && authToken.startsWith("Bearer ")) {
      authToken = authToken.substring(7);
    } else {
      // Fall back to custom header
      authToken = ctx.request.headers.get("x-auth-token");
    }

    if (!authToken) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Unauthorized: Missing token" };
      return;
    }

    const isValid = await isAuthorized(authToken);
    if (!isValid) {
      ctx.response.status = 401;
      ctx.response.body = { error: "Unauthorized: Invalid or expired token" };
      return;
    }

    // Get token info and add to context
    const tokenInfo = activeTokens[authToken];
    const tokenPayload = await verify(authToken, secretKey) as TokenPayload;
    
    ctx.state.tokenData = {
      ...tokenPayload,
      ...tokenInfo
    };
    
    await next();
  } catch (error) {
    console.error("❌ Token auth middleware error:", error);
    ctx.response.status = 401;
    ctx.response.body = { error: "Unauthorized: Token verification failed" };
  }
}

// Also update the ChatManager class to handle string room IDs



// Modify your initializeDatabase function to include sample data creation
// Add this line at the end of your initializeDatabase function:
// await createSampleData();

// Also add a debug endpoint to check what's in the database
router.get("/api/debug/articles", async (ctx) => {
    try {
        const allArticles = await client.query("SELECT * FROM articles");
        const allBooks = await client.query("SELECT * FROM books");
        const allDvds = await client.query("SELECT * FROM dvds");
        const allCds = await client.query("SELECT * FROM cds");
        const allUsers = await client.query("SELECT id, username FROM users");

        ctx.response.body = {
            articles: allArticles,
            books: allBooks,
            dvds: allDvds,
            cds: allCds,
            users: allUsers
        };
    } catch (error) {
        console.error("❌ Debug endpoint error:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error" };
    }
});

router.get("/api/articles/:articleId/messages", tokenAuthMiddleware, async (ctx) => {
    try {
        const articleId = parseInt(ctx.params.articleId);
        const limit = parseInt(ctx.request.url.searchParams.get('limit') || '50');
        
        if (!articleId) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid article ID" };
            return;
        }

        const messages = await chatManager.getMessageHistory(articleId, limit);
        
        ctx.response.body = {
            message: "Messages retrieved successfully",
            messages
        };
    } catch (error) {
        console.error("❌ Messages retrieval error:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error" };
    }
});

// Get chat participants for an article
router.get("/api/articles/:articleId/participants", tokenAuthMiddleware, async (ctx) => {
    try {
        const articleId = parseInt(ctx.params.articleId);
        
        if (!articleId) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Invalid article ID" };
            return;
        }

        // Get unique participants from chat messages
        const participants = await client.query(`
            SELECT DISTINCT u.id, u.username
            FROM chat_messages cm
            JOIN users u ON cm.user_id = u.id
            WHERE cm.article_id = ?
            ORDER BY u.username
        `, [articleId]);

        ctx.response.body = {
            message: "Participants retrieved successfully",
            participants
        };
    } catch (error) {
        console.error("❌ Participants retrieval error:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error" };
    }
});


router.get("/api/users/:userId/conversations", tokenAuthMiddleware, async (ctx) => {
  try {
      const userId = parseInt(ctx.params.userId);
      const tokenData = ctx.state.tokenData as JWTPayload;
      
      // Verify user is accessing their own conversations
      if (userId !== tokenData.userId) {
          ctx.response.status = 403;
          ctx.response.body = { error: "Forbidden: Cannot access other users' conversations" };
          return;
      }
      
      // Get all unique conversations for the user
      // This query finds all unique user pairs and their latest messages
      const conversations = await client.query(`
          WITH conversation_summary AS (
              SELECT 
                  cm.article_id,
                  cm.user_id,
                  cm.username,
                  cm.message,
                  cm.timestamp,
                  a.user_id as article_owner_id,
                  a.price as article_price,
                  a.item_type,
                  a.item_id,
                  u.username as article_owner_username,
                  CASE 
                      WHEN cm.user_id = ? THEN a.user_id
                      ELSE cm.user_id
                  END as other_user_id,
                  CASE 
                      WHEN cm.user_id = ? THEN u.username
                      ELSE cm.username
                  END as other_username,
                  CASE
                      WHEN a.user_id = ? THEN 'seller'
                      ELSE 'buyer'
                  END as user_role
              FROM chat_messages cm
              JOIN articles a ON cm.article_id = a.id
              JOIN users u ON a.user_id = u.id
              WHERE cm.article_id IN (
                  SELECT DISTINCT article_id 
                  FROM chat_messages 
                  WHERE user_id = ? OR article_id IN (
                      SELECT id FROM articles WHERE user_id = ?
                  )
              )
          ),
          latest_messages AS (
              SELECT 
                  article_id,
                  other_user_id,
                  other_username,
                  user_role,
                  MAX(timestamp) as last_message_time
              FROM conversation_summary
              WHERE user_id = ? OR article_owner_id = ?
              GROUP BY article_id, other_user_id, other_username, user_role
          )
          SELECT 
              cs.*,
              lm.last_message_time,
              b.title as book_title,
              b.author as book_author,
              b.genre as book_genre,
              d.title as dvd_title,
              d.director as dvd_director,
              d.genre as dvd_genre,
              c.author as cd_author,
              c.genre as cd_genre
          FROM latest_messages lm
          JOIN conversation_summary cs ON 
              cs.article_id = lm.article_id 
              AND cs.other_user_id = lm.other_user_id
              AND cs.timestamp = lm.last_message_time
          LEFT JOIN books b ON cs.item_type = 'book' AND cs.item_id = b.id
          LEFT JOIN dvds d ON cs.item_type = 'dvd' AND cs.item_id = d.id
          LEFT JOIN cds c ON cs.item_type = 'cd' AND cs.item_id = c.id
          ORDER BY cs.timestamp DESC
      `, [userId, userId, userId, userId, userId, userId, userId]);
      
      // Process and format conversations
      const formattedConversations = [];
      const conversationMap = new Map();
      
      for (const conv of conversations) {
          const key = `${conv.other_username}_${conv.article_id}`;
          
          // Get item info based on type
          let itemInfo = {};
          if (conv.item_type === 'book') {
              itemInfo = {
                  title: conv.book_title,
                  author: conv.book_author,
                  genre: conv.book_genre
              };
          } else if (conv.item_type === 'dvd') {
              itemInfo = {
                  title: conv.dvd_title,
                  director: conv.dvd_director,
                  genre: conv.dvd_genre
              };
          } else if (conv.item_type === 'cd') {
              itemInfo = {
                  author: conv.cd_author,
                  genre: conv.cd_genre
              };
          }
          
          // Count unread messages for this conversation
          const unreadMessages = await client.query(`
              SELECT COUNT(*) as unread_count
              FROM chat_messages
              WHERE article_id = ?
              AND user_id != ?
              AND timestamp > COALESCE((
                  SELECT MAX(timestamp)
                  FROM chat_messages
                  WHERE article_id = ?
                  AND user_id = ?
              ), '1970-01-01')
          `, [conv.article_id, userId, conv.article_id, userId]);
          
          const unreadCount = unreadMessages[0]?.unread_count || 0;
          
          if (!conversationMap.has(key)) {
              conversationMap.set(key, {
                  otherUser: {
                      id: conv.other_user_id,
                      username: conv.other_username
                  },
                  articleId: conv.article_id,
                  articleTitle: itemInfo.title || itemInfo.author || 'Untitled',
                  articlePrice: parseFloat(conv.article_price),
                  articleImage: conv.article_image,
                  itemType: conv.item_type,
                  itemInfo: itemInfo,
                  role: conv.user_role,
                  lastMessage: {
                      id: conv.id,
                      user_id: conv.user_id,
                      username: conv.username,
                      message: conv.message,
                      timestamp: conv.timestamp
                  },
                  lastMessageTime: conv.timestamp,
                  unreadCount: unreadCount
              });
          }
      }
      
      // Convert map to array
      for (const [key, value] of conversationMap) {
          formattedConversations.push(value);
      }
      
      ctx.response.body = {
          message: "Conversations retrieved successfully",
          conversations: formattedConversations
      };
      
  } catch (error) {
      console.error("❌ Conversations retrieval error:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error" };
  }
});

// Also add an endpoint to get all messages between two users
router.get("/api/conversations/:otherUsername/messages", tokenAuthMiddleware, async (ctx) => {
  try {
      const otherUsername = ctx.params.otherUsername;
      const tokenData = ctx.state.tokenData as JWTPayload;
      const currentUserId = tokenData.userId;
      
      // Get the other user's ID
      const otherUserResult = await client.query(
          "SELECT id FROM users WHERE username = ?",
          [otherUsername]
      );
      
      if (otherUserResult.length === 0) {
          ctx.response.status = 404;
          ctx.response.body = { error: "User not found" };
          return;
      }
      
      const otherUserId = otherUserResult[0].id;
      
      // Get all messages between these two users across all articles
      const messages = await client.query(`
          SELECT 
              cm.*,
              a.item_type,
              a.item_id,
              a.price,
          FROM chat_messages cm
          JOIN articles a ON cm.article_id = a.id
          WHERE 
              (cm.user_id = ? AND a.user_id = ?) OR
              (cm.user_id = ? AND a.user_id = ?) OR
              (cm.user_id = ? AND cm.article_id IN (
                  SELECT DISTINCT article_id 
                  FROM chat_messages 
                  WHERE user_id = ?
              )) OR
              (cm.user_id = ? AND cm.article_id IN (
                  SELECT DISTINCT article_id 
                  FROM chat_messages 
                  WHERE user_id = ?
              ))
          ORDER BY cm.timestamp ASC
      `, [currentUserId, otherUserId, otherUserId, currentUserId, 
          currentUserId, otherUserId, otherUserId, currentUserId]);
      
      ctx.response.body = {
          message: "Messages retrieved successfully",
          messages: messages,
          currentUserId: currentUserId,
          otherUserId: otherUserId,
          otherUsername: otherUsername
      };
      
  } catch (error) {
      console.error("❌ Messages retrieval error:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error" };
  }
});

// Delete an article (only by the owner)
router.delete("/api/articles/:id", tokenAuthMiddleware, async (ctx) => {
  try {
      const articleId = parseInt(ctx.params.id);
      const tokenData = ctx.state.tokenData as JWTPayload;
      const userId = tokenData.userId;
      const isAdmin = tokenData.isAdmin || false;
      
      if (!articleId || isNaN(articleId)) {
          ctx.response.status = 400;
          ctx.response.body = { error: "Invalid article ID" };
          return;
      }
      
      // Check if the article exists
      const articles = await client.query(
          "SELECT * FROM articles WHERE id = ?",
          [articleId]
      );
      
      if (articles.length === 0) {
          ctx.response.status = 404;
          ctx.response.body = { error: "Article not found" };
          return;
      }
      
      const article = articles[0];
      
      // Check permissions: either owner OR admin
      const isOwner = article.user_id === userId;
      
      if (!isOwner && !isAdmin) {
          ctx.response.status = 403;
          ctx.response.body = { error: "Forbidden: You can only delete your own articles" };
          return;
      }
      
      // Log admin deletion for auditing
      if (isAdmin && !isOwner) {
          console.log(`🚨 ADMIN DELETION: User ${tokenData.username} (ID: ${userId}) is deleting article ${articleId} owned by user ${article.user_id}`);
      }
      
      // Delete the article first (this will cascade delete related chat messages due to foreign key constraint)
      await client.execute(
          "DELETE FROM articles WHERE id = ?",
          [articleId]
      );
      
      // Check if the item (book, dvd, or cd) is referenced by other articles
      const otherArticlesWithSameItem = await client.query(
          "SELECT COUNT(*) as count FROM articles WHERE item_type = ? AND item_id = ? AND id != ?",
          [article.item_type, article.item_id, articleId]
      );
      
      const itemStillReferenced = otherArticlesWithSameItem[0].count > 0;
      
      // Only delete the associated item if no other articles reference it
      if (!itemStillReferenced) {
          try {
              if (article.item_type === 'book') {
                  await client.execute("DELETE FROM books WHERE id = ?", [article.item_id]);
                  console.log(`🗑️ Deleted book with ID ${article.item_id} (no other articles reference it)`);
              } else if (article.item_type === 'dvd') {
                  await client.execute("DELETE FROM dvds WHERE id = ?", [article.item_id]);
                  console.log(`🗑️ Deleted DVD with ID ${article.item_id} (no other articles reference it)`);
              } else if (article.item_type === 'cd') {
                  await client.execute("DELETE FROM cds WHERE id = ?", [article.item_id]);
                  console.log(`🗑️ Deleted CD with ID ${article.item_id} (no other articles reference it)`);
              }
          } catch (itemError) {
              // If item deletion fails, it's okay - the article is already deleted
              console.log(`⚠️ Could not delete ${article.item_type} with ID ${article.item_id}: ${itemError.message}`);
          }
      } else {
          console.log(`ℹ️ Keeping ${article.item_type} with ID ${article.item_id} (referenced by other articles)`);
      }
      
      if (isAdmin && !isOwner) {
          console.log(`✅ ADMIN DELETION COMPLETED: Article ${articleId} deleted by admin ${tokenData.username}`);
      } else {
          console.log(`🗑️ Article ${articleId} deleted by owner ${tokenData.username}`);
      }
      
      ctx.response.status = 200;
      ctx.response.body = {
          message: "Article deleted successfully",
          deletedArticle: {
              id: articleId,
              item_type: article.item_type,
              item_id: article.item_id
          },
          deletedBy: isAdmin && !isOwner ? "admin" : "owner"
      };
  } catch (error) {
      console.error("❌ Article deletion error:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error: " + error.message };
  }
});

// Mark an article as sold (alternative to deletion)
router.patch("/api/articles/:id/sold", tokenAuthMiddleware, async (ctx) => {
  try {
      const articleId = parseInt(ctx.params.id);
      const tokenData = ctx.state.tokenData as JWTPayload;
      const userId = tokenData.userId;
      const isAdmin = tokenData.isAdmin || false;
      
      if (!articleId || isNaN(articleId)) {
          ctx.response.status = 400;
          ctx.response.body = { error: "Invalid article ID" };
          return;
      }
      
      // Check if the article exists
      const articles = await client.query(
          "SELECT * FROM articles WHERE id = ?",
          [articleId]
      );
      
      if (articles.length === 0) {
          ctx.response.status = 404;
          ctx.response.body = { error: "Article not found" };
          return;
      }
      
      const article = articles[0];
      
      // Check permissions: either owner OR admin
      const isOwner = article.user_id === userId;
      
      if (!isOwner && !isAdmin) {
          ctx.response.status = 403;
          ctx.response.body = { error: "Forbidden: You can only modify your own articles" };
          return;
      }
      
      // Toggle the sold status
      const currentStatus = article.is_sold;
      const newStatus = !currentStatus;
      
      // Log admin action for auditing
      if (isAdmin && !isOwner) {
          console.log(`🚨 ADMIN ACTION: User ${tokenData.username} (ID: ${userId}) is marking article ${articleId} as ${newStatus ? 'sold' : 'available'} (owned by user ${article.user_id})`);
      }
      
      await client.execute(
          "UPDATE articles SET is_sold = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
          [newStatus, articleId]
      );
      
      if (isAdmin && !isOwner) {
          console.log(`✅ ADMIN ACTION COMPLETED: Article ${articleId} marked as ${newStatus ? 'sold' : 'available'} by admin ${tokenData.username}`);
      } else {
          console.log(`📦 Article ${articleId} marked as ${newStatus ? 'sold' : 'available'} by owner ${tokenData.username}`);
      }
      
      ctx.response.status = 200;
      ctx.response.body = {
          message: `Article marked as ${newStatus ? 'sold' : 'available'} successfully`,
          article: {
              id: articleId,
              is_sold: newStatus
          },
          actionBy: isAdmin && !isOwner ? "admin" : "owner"
      };
  } catch (error) {
      console.error("❌ Article status update error:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error" };
  }
});
// Get all articles for the current user
router.get("/api/users/me/articles", tokenAuthMiddleware, async (ctx) => {
  try {
      const tokenData = ctx.state.tokenData as JWTPayload;
      const userId = tokenData.userId;
      
      // Get all articles for the user
      const articles = await client.query(`
          SELECT 
              a.*,
              CASE 
                  WHEN a.item_type = 'book' THEN b.title
                  WHEN a.item_type = 'dvd' THEN d.title
                  WHEN a.item_type = 'cd' THEN c.author
              END as item_name,
              CASE 
                  WHEN a.item_type = 'book' THEN b.author
                  WHEN a.item_type = 'dvd' THEN d.director
                  WHEN a.item_type = 'cd' THEN c.author
              END as item_creator,
              CASE 
                  WHEN a.item_type = 'book' THEN b.genre
                  WHEN a.item_type = 'dvd' THEN d.genre
                  WHEN a.item_type = 'cd' THEN c.genre
              END as item_genre,
              (SELECT COUNT(*) FROM chat_messages WHERE article_id = a.id) as message_count
          FROM articles a
          LEFT JOIN books b ON a.item_type = 'book' AND a.item_id = b.id
          LEFT JOIN dvds d ON a.item_type = 'dvd' AND a.item_id = d.id
          LEFT JOIN cds c ON a.item_type = 'cd' AND a.item_id = c.id
          WHERE a.user_id = ?
          ORDER BY a.created_at DESC
      `, [userId]);
      
      ctx.response.body = {
          message: "User articles retrieved successfully",
          articles: articles.map(article => ({
              id: article.id,
              item_type: article.item_type,
              item_name: article.item_name,
              item_creator: article.item_creator,
              item_genre: article.item_genre,
              description: article.description,
              price: parseFloat(article.price),
              is_sold: Boolean(article.is_sold),
              message_count: article.message_count,
              created_at: article.created_at,
              updated_at: article.updated_at
          }))
      };
  } catch (error) {
      console.error("❌ User articles retrieval error:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error" };
  }
});

// Application setup
const app = new Application();

// Debug middleware - add this FIRST to see all requests
app.use(async (ctx, next) => {
  const start = Date.now();
  console.log(`🚀 Incoming request: ${ctx.request.method} ${ctx.request.url.pathname}`);
  console.log(`🔍 Headers:`, Object.fromEntries(ctx.request.headers.entries()));
  
  await next();
  
  const ms = Date.now() - start;
  console.log(`✅ Request completed: ${ctx.request.method} ${ctx.request.url.pathname} - ${ctx.response.status} - ${ms}ms`);
});

// Also update your app middleware to better handle WebSocket routing
// Replace the existing WebSocket middleware in your main.ts with this:

app.use(async (ctx, next) => {
  const path = ctx.request.url.pathname;
  
  // Handle chat WebSocket connections
  if (path.startsWith('/ws/chat/')) {
    console.log('🔌 Chat WebSocket request detected:', path);
    
    const upgrade = ctx.request.headers.get("upgrade");
    if (upgrade?.toLowerCase() !== 'websocket') {
      console.log('❌ Not a WebSocket upgrade request');
      ctx.response.status = 400;
      ctx.response.body = { error: 'Expected WebSocket upgrade' };
      return;
    }
    
    await handleChatWebSocket(ctx);
    return; // Don't call next() for WebSocket routes
  }
  
  // Handle test WebSocket
  if (path === '/ws/test') {
    console.log('🧪 Test WebSocket request detected');
    
    const upgrade = ctx.request.headers.get("upgrade");
    if (upgrade?.toLowerCase() !== 'websocket') {
      console.log('❌ Not a WebSocket upgrade request');
      ctx.response.status = 400;
      ctx.response.body = { error: 'Expected WebSocket upgrade' };
      return;
    }
    
    try {
      const socket = ctx.upgrade();
      
      socket.onopen = () => {
        console.log("🧪 Test WebSocket opened");
        socket.send(JSON.stringify({ type: 'connected', message: 'Test WebSocket connected successfully' }));
      };
      
      socket.onmessage = (event) => {
        console.log("🧪 Test WebSocket received:", event.data);
        try {
          const data = JSON.parse(event.data);
          socket.send(JSON.stringify({ 
            type: 'echo', 
            original: data,
            timestamp: new Date().toISOString()
          }));
        } catch (e) {
          socket.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
        }
      };
      
      socket.onclose = (event) => {
        console.log("🧪 Test WebSocket closed:", event.code, event.reason);
      };
      
      socket.onerror = (error) => {
        console.error("🧪 Test WebSocket error:", error);
      };
      
      return;
    } catch (error) {
      console.error('❌ Test WebSocket error:', error);
      ctx.response.status = 500;
      ctx.response.body = { error: 'Test WebSocket failed', details: error.message };
      return;
    }
  }
  
  await next();
});

// CORS middleware
app.use(oakCors({
  origin: ["http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:3000"], 
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "Cache-Control", "X-auth-token"],
  credentials: true,
  optionsSuccessStatus: 200
}));


// Request logging middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${ctx.request.method} ${ctx.request.url} - ${ctx.response.status} - ${ms}ms`);
});

// Router middleware
app.use(router.routes());
app.use(router.allowedMethods());

// Error handling middleware
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    console.error("❌ Unhandled error:", err);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Start server
async function startServer() {
  console.log("🚀 Starting Authentication Server...");
  
  // Connect to database
  const connected = await connectToDatabase();
  if (!connected) {
    console.log("💡 To start MySQL Docker container:");
    console.log("   sudo docker start mysql-auth");
    console.log("💡 Or create new container:");
    console.log(`   sudo docker run --name mysql-auth -e MYSQL_ROOT_PASSWORD=mypassword -e MYSQL_DATABASE=auth_db -p 3306:3306 -d mysql:8.0`);
    Deno.exit(1);
  }
  
  // Initialize database
  await initializeDatabase();
  await initializeChatTables()
  
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log("📚 Available endpoints:");
  console.log("  POST /api/auth/register - Register a new user");
  console.log("  POST /api/auth/login - Login user");
  console.log("  GET  /api/auth/profile - Get user profile (protected)");
  console.log("  GET  /api/users - Get all users (protected)");
  console.log("  POST /api/auth/logout - Logout user (protected)");
  console.log("  GET  /api/health - Health check");
  console.log("");
  console.log("🌐 Frontend: Open index.html in your browser");
  console.log("📊 Database: MySQL running in Docker container 'mysql-auth'");
  
  await app.listen({ port: PORT });
}

// Handle graceful shutdown
addEventListener("unload", async () => {
  console.log("🛑 Shutting down server...");
  if (client) {
    await client.close();
    console.log("✅ Database connection closed");
  }
});

// Start the server
startServer().catch(console.error);
