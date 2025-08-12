// main.ts - Your Deno Authentication Server
import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, verify } from "https://deno.land/x/djwt@v3.0.1/mod.ts";
import { WebSocketServer } from "https://deno.land/x/websocket@v0.1.4/mod.ts";

// Load environment variables
const DB_HOST = "127.0.0.1";
const DB_USER = "root";
const DB_PASSWORD = "mypassword";
const DB_NAME = "auth_db";
const DB_PORT = parseInt("3306");
const JWT_SECRET = "default-secret";
const PORT = parseInt("8000");


console.log("🔧 Starting server with configuration:");
console.log(`   Database: ${DB_HOST}:${DB_PORT}/${DB_NAME}`);
console.log(`   User: ${DB_USER}`);
console.log(`   Server Port: ${PORT}`);

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
            picture_url VARCHAR(500),
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
    picture_url?: string;
    is_sold?: boolean;
    created_at?: Date;
    updated_at?: Date;
  }
  
  interface JWTPayload {
    userId: number;
    username: string;
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

// Helper functions
function generateJWT(payload: JWTPayload): Promise<string> {
  return create({ alg: "HS512", typ: "JWT" }, payload, secretKey);
}

// Middleware for JWT authentication
async function authMiddleware(ctx: any, next: () => Promise<unknown>) {
    const cookie = ctx.request.headers.get("cookie");
    const authToken = cookie?.split("; ").find(row => row.startsWith("auth_token="))?.split('=')[1];

    if (!authToken) {
        ctx.response.status = 401;
        ctx.response.body = { error: "Unauthorized: Missing token" };
        return;
    }

    try {
      // Verify the token
      const tokenData = await verify(authToken, secretKey);
      ctx.state.tokenData = tokenData; // Store data in ctx.state for use in other middlewares/routes
      await next();
    } catch {
      ctx.response.status = 401;
      ctx.response.body = { error: "Unauthorized: Invalid token" };
    }
}

// Router setup
const router = new Router();

// Register endpoint
router.post("/api/auth/register", async (ctx) => {
  try {
    const body = await ctx.request.body();
    const { username, password } = await body.value;

    console.log(`Registration attempt for: ${username}`);

    // Validation
    if (!username || !password) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Username and password are required" };
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
      ctx.response.status = 409;
      ctx.response.body = { error: "Username already exists" };
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password);

    // Insert user - Fixed SQL query (removed extra parameter)
    const result = await client.execute(
      "INSERT INTO users (username, password) VALUES (?, ?)",
      [username, hashedPassword]
    );

    // Generate JWT
    const payload: JWTPayload = {
        userId: result.lastInsertId as number,
        username,
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24),
    };

    const token = await generateJWT(payload);

    console.log(`✅ User registered successfully: ${username} (ID: ${result.lastInsertId})`);

    ctx.response.status = 201;
    ctx.response.body = {
      message: "User registered successfully",
      token,
      user: {
        id: result.lastInsertId,
        username,
      },
    };
  } catch (error) {
    console.error("❌ Registration error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Login endpoint
router.post("/api/auth/login", async (ctx) => {
  try {
    const body = await ctx.request.body();
    const { username, password } = await body.value;

    console.log(`🔐 Login attempt for: ${username}`);

    if (!username || !password) {
      ctx.response.status = 400;
      ctx.response.body = { error: "Username and password are required" };
      return;
    }

    // Find user by username - Fixed SQL query (removed duplicate parameter)
    const users = await client.query(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );

    if (users.length === 0) {
      console.log(`❌ Login failed: User not found - ${username}`);
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid credentials" };
      return;
    }

    const user = users[0] as any;

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.log(`❌ Login failed: Invalid password - ${username}`);
      ctx.response.status = 401;
      ctx.response.body = { error: "Invalid credentials" };
      return;
    }

    // Generate JWT
    const payload: JWTPayload = {
        userId: user.id,
        username: user.username,
        exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24),
    };

    const token = await generateJWT(payload);

    // Set the cookie (HttpOnly for security)
    ctx.response.headers.set(
        "Set-Cookie", 
        `auth_token=${token}; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24}; Path=/; ${Deno.env.get('NODE_ENV') === 'production' ? 'Secure;' : ''}`
    );

    console.log(`✅ User logged in successfully: ${user.username} (ID: ${user.id})`);

    ctx.response.body = {
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
      },
    };
  } catch (error) {
    console.error("❌ Login error:", error);
    ctx.response.status = 500;
    ctx.response.body = { error: "Internal server error" };
  }
});

// Logout endpoint
router.post("/api/auth/logout", (ctx) => {
  console.log(`👋 User logged out: ${ctx.state.user.username}`);
  ctx.response.body = {
    message: "Logout successful. Please remove the token from client storage.",
  };
});

// Create a book
router.post("/api/books", authMiddleware, async (ctx) => {
  try {
    const body = await ctx.request.body();
    const { title, author, publication_date, genre } = await body.value;

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
router.post("/api/dvds", authMiddleware, async (ctx) => {
  try {
    const body = await ctx.request.body();
    const { title, publication_date, director, genre } = await body.value;

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
router.post("/api/cds", authMiddleware, async (ctx) => {
  try {
    const body = await ctx.request.body();
    const { author, publication_date, genre } = await body.value;

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
router.post("/api/articles", authMiddleware, async (ctx) => {
    try {
      const body = await ctx.request.body();
      const { item_type, item_id, description, price, picture_url } = await body.value;
      const tokenData = ctx.state.tokenData as JWTPayload;
  
      if (!item_type || !item_id || !price) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Item type, item ID, and price are required" };
        return;
      }
  
      if (!['book', 'dvd', 'cd'].includes(item_type)) {
        ctx.response.status = 400;
        ctx.response.body = { error: "Item type must be 'book', 'dvd', or 'cd'" };
        return;
      }
  
      // Verify that the item exists
      let itemExists = false;
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
  
      if (!itemExists) {
        ctx.response.status = 404;
        ctx.response.body = { error: "Item not found" };
        return;
      }
  
      const result = await client.execute(
        "INSERT INTO articles (user_id, item_type, item_id, description, price, picture_url) VALUES (?, ?, ?, ?, ?, ?)",
        [tokenData.userId, item_type, item_id, description || null, price, picture_url || null]
      );
  
      ctx.response.status = 201;
      ctx.response.body = {
        message: "Article created successfully",
        article: {
          id: result.lastInsertId,
          user_id: tokenData.userId,
          item_type,
          item_id,
          description,
          price,
          picture_url,
        },
      };
    } catch (error) {
      console.error("❌ Article creation error:", error);
      ctx.response.status = 500;
      ctx.response.body = { error: "Internal server error" };
    }
});

router.get('/test_cookie', authMiddleware, (ctx) => {
    ctx.response.body = { message: 'Token verified successfully', token_data: ctx.state.tokenData };
 
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
          a.picture_url,
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
        picture_url: article.picture_url,
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
        a.picture_url,
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
      picture_url: article.picture_url,
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
        a.picture_url,
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
        a.picture_url,
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
        a.picture_url,
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
        picture_url: article.picture_url,
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
        picture_url: article.picture_url,
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
        picture_url: article.picture_url,
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
          a.picture_url,
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
        picture_url: article.picture_url,
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
          a.picture_url,
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
        picture_url: article.picture_url,
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

router.get("/api/articles/:articleId/messages", authMiddleware, async (ctx) => {
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
router.get("/api/articles/:articleId/participants", authMiddleware, async (ctx) => {
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
  origin: "http://localhost:8080", // In production, specify your frontend domain
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
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
