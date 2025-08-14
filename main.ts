// Test cookie endpoint - for profile page
router.get("/test_cookie", cookieAuthMiddleware, async (ctx) => {
    try {
        const user = ctx.state.user;
        
        ctx.response.body = { 
            message: 'Token verified successfully', 
            token_data: {
                userId: user.id,
                username: user.username,
                isAdmin: user.isAdmin,
                sessionId: user.sessionId
            }
        };
    } catch (error) {
        console.error("❌ Test cookie error:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error" };
    }
});

// ✅ NEW: Special endpoint to handle multiple sessions
router.post("/api/auth/select-session", async (ctx) => {
    try {
        const body = await ctx.request.body();
        const { sessionId } = await body.value;
        
        if (!sessionId) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Session ID required" };
            return;
        }
        
        // Check if session exists
        const sessionInfo = activeSessions[sessionId];
        if (!sessionInfo) {
            ctx.response.status = 404;
            ctx.response.body = { error: "Session not found" };
            return;
        }
        
        // Generate new token for this specific session
        const token = await generateJWT({
            userId: sessionInfo.userId,
            username: sessionInfo.username,
            sessionId: sessionId,
            isAdmin: sessionInfo.isAdmin
        });
        
        // Set the cookie for this session
        const isProduction = Deno.env.get('NODE_ENV') === 'production';
        await ctx.cookies.set("auth_token", token, {
            httpOnly: true,
            sameSite: "lax",
            maxAge: 8 * 60 * 60 * 1000,
            secure: isProduction,
            domain: "localhost"
        });
        
        ctx.response.body = {
            message: "Session selected successfully",
            user: {
                id: sessionInfo.userId,
                username: sessionInfo.username,
                isimport { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
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

// Database connection
let client: Client;

// Create a proper crypto key for JWT
const secretKey = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-512" },
    true,
    ["sign", "verify"]
);

// Types
interface User {
    id?: number;
    username: string;
    password: string;
    is_admin?: boolean;
    created_at?: Date;
    updated_at?: Date;
}

interface JWTPayload {
    userId: number;
    username: string;
    isAdmin: boolean;
    sessionId: string;
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
    chatRoomId?: string;
}

interface SessionInfo {
    userId: number;
    username: string;
    isAdmin: boolean;
    loginTime: Date;
    lastActivity: Date;
    userAgent?: string;
    ipAddress?: string;
}

// ✅ FIXED: Allow multiple concurrent sessions per user
const activeSessions: { [sessionId: string]: SessionInfo } = {};

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
    } catch (error) {
        console.error("❌ Chat tables initialization error:", error.message);
        throw error;
    }
}

// Helper functions
function generateSessionId(): string {
    return crypto.randomUUID();
}

function generateJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
    const fullPayload: JWTPayload = {
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (8 * 60 * 60), // ✅ FIXED: 8 hours
    };
    return create({ alg: "HS512", typ: "JWT" }, fullPayload, secretKey);
}

// ✅ FIXED: Standard auth middleware - now returns multiple valid sessions
async function cookieAuthMiddleware(ctx: any, next: () => Promise<unknown>) {
    try {
        console.log(`🍪 Cookie auth middleware called for: ${ctx.request.method} ${ctx.request.url.pathname}`);
        
        // Get token from cookie using Oak's cookie API
        const authToken = await ctx.cookies.get("auth_token");
        console.log(`🍪 Cookie auth token found: ${authToken ? 'YES' : 'NO'}`);
        
        if (authToken) {
            console.log(`🍪 Token length: ${authToken.length}, starts with: ${authToken.substring(0, 20)}...`);
        }

        if (!authToken) {
            console.log("❌ No auth token in cookies");
            ctx.response.status = 401;
            ctx.response.body = { error: "Unauthorized: No token provided" };
            return;
        }

        // Verify JWT token
        console.log("🔍 Verifying JWT token...");
        const payload = await verify(authToken, secretKey) as JWTPayload;
        console.log(`🔍 JWT payload: userId=${payload.userId}, username=${payload.username}, sessionId=${payload.sessionId.substring(0, 8)}...`);
        
        // Check if session exists
        const sessionInfo = activeSessions[payload.sessionId];
        console.log(`🔍 Session exists: ${sessionInfo ? 'YES' : 'NO'}`);
        
        if (!sessionInfo) {
            console.log(`❌ Session not found for sessionId: ${payload.sessionId.substring(0, 8)}...`);
            console.log(`📊 Available sessions: ${Object.keys(activeSessions).map(s => s.substring(0, 8)).join(', ')}`);
            ctx.response.status = 401;
            ctx.response.body = { error: "Unauthorized: Session expired" };
            return;
        }

        // ✅ FIXED: Verify that the session belongs to the same user (security check)
        if (sessionInfo.userId !== payload.userId) {
            console.log(`❌ Session user mismatch: session=${sessionInfo.userId}, token=${payload.userId}`);
            ctx.response.status = 401;
            ctx.response.body = { error: "Unauthorized: Invalid session" };
            return;
        }

        // Update last activity
        sessionInfo.lastActivity = new Date();
        console.log(`✅ Session validated for user: ${sessionInfo.username}`);

        // Add user info to context
        ctx.state.user = {
            id: payload.userId,
            username: payload.username,
            isAdmin: payload.isAdmin,
            sessionId: payload.sessionId
        };

        await next();
    } catch (error) {
        console.error("❌ Cookie auth middleware error:", error);
        console.error("❌ Error details:", error.message);
        ctx.response.status = 401;
        ctx.response.body = { error: "Unauthorized: Invalid token" };
    }
}

// Simple auth middleware for legacy endpoints
async function simpleAuthMiddleware(ctx: any, next: () => Promise<unknown>) {
    try {
        const body = await ctx.request.body();
        const bodyValue = await body.value;
        const auth_token = bodyValue.auth_token;

        if (!auth_token) {
            ctx.response.status = 401;
            ctx.response.body = { error: "Unauthorized: No token provided" };
            return;
        }

        // Verify JWT token
        const payload = await verify(auth_token, secretKey) as JWTPayload;
        
        // Check if session exists
        const sessionInfo = activeSessions[payload.sessionId];
        if (!sessionInfo) {
            ctx.response.status = 401;
            ctx.response.body = { error: "Unauthorized: Session expired" };
            return;
        }

        // Add user info to context
        ctx.state.user = {
            id: payload.userId,
            username: payload.username,
            isAdmin: payload.isAdmin
        };

        await next();
    } catch (error) {
        console.error("❌ Simple auth middleware error:", error);
        ctx.response.status = 401;
        ctx.response.body = { error: "Unauthorized: Invalid token" };
    }
}

// Chat Manager Class
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
            }
            
            this.clients.delete(clientId);
            console.log(`📞 User ${client.username} (${clientId}) left room ${roomKey}`);
        }
    }

    broadcastToRoom(roomKey: string | number, message: any, excludeClientId?: string) {
        const roomKeyStr = roomKey.toString();
        const room = this.rooms.get(roomKeyStr);
        
        if (!room || room.size === 0) {
            return;
        }

        const messageStr = JSON.stringify(message);
        
        room.forEach(clientId => {
            if (clientId === excludeClientId) {
                return;
            }
            
            const client = this.clients.get(clientId);
            if (client && client.ws.readyState === WebSocket.OPEN) {
                try {
                    client.ws.send(messageStr);
                } catch (error) {
                    console.error(`❌ Error sending to ${clientId}:`, error);
                    this.removeClient(clientId);
                }
            }
        });
    }

    async saveMessage(message: ChatMessage): Promise<number> {
        try {
            const formattedTimestamp = new Date(message.timestamp).toISOString().slice(0, 19).replace('T', ' ');
            
            const result = await client.execute(
                "INSERT INTO chat_messages (article_id, user_id, username, message, timestamp) VALUES (?, ?, ?, ?, ?)",
                [message.article_id, message.user_id, message.username, message.message, formattedTimestamp]
            );
            
            const messageId = result.lastInsertId as number;
            return messageId;
        } catch (error) {
            console.error('❌ Error saving message:', error);
            throw error;
        }
    }

    async getMessageHistory(articleId: number, limit: number = 50): Promise<ChatMessage[]> {
        try {
            const messages = await client.query(
                "SELECT * FROM chat_messages WHERE article_id = ? ORDER BY timestamp DESC LIMIT ?",
                [articleId, limit]
            );
            
            return messages.reverse().map((msg: any) => ({
                id: msg.id,
                article_id: msg.article_id,
                user_id: msg.user_id,
                username: msg.username,
                message: msg.message,
                timestamp: msg.timestamp
            }));
        } catch (error) {
            console.error('❌ Error getting message history:', error);
            return [];
        }
    }
}

const chatManager = new ChatManager();

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

        // ✅ FIXED: Get client info for session tracking
        const userAgent = ctx.request.headers.get("user-agent") || "Unknown";
        const ipAddress = ctx.request.ip || "Unknown";

        // Create session
        activeSessions[sessionId] = {
            userId,
            username,
            isAdmin: false,
            loginTime: new Date(),
            lastActivity: new Date(),
            userAgent,
            ipAddress
        };

        // Generate JWT
        const token = await generateJWT({
            userId,
            username,
            sessionId,
            isAdmin: false
        });

        // ✅ FIXED: Use standard cookie name but return session info for frontend
        const isProduction = Deno.env.get('NODE_ENV') === 'production';
        await ctx.cookies.set("auth_token", token, {
            httpOnly: true,
            sameSite: "lax",
            maxAge: 8 * 60 * 60 * 1000, // 8 hours in milliseconds
            secure: isProduction,
            domain: "localhost"
        });

        console.log(`✅ User registered successfully: ${username} (ID: ${userId}, Session: ${sessionId.substring(0, 8)}...)`);

        ctx.response.status = 201;
        ctx.response.body = {
            message: "User registered successfully",
            user: {
                id: userId,
                username,
                isAdmin: false
            },
            sessionId: sessionId, // ✅ FIXED: Return session ID for frontend tracking
        };
    } catch (error) {
        console.error("❌ Registration error:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error: " + error.message };
    }
});

// ✅ FIXED: Login endpoint - Allow multiple concurrent sessions
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

        // ✅ FIXED: DON'T clean up existing sessions - allow multiple concurrent sessions
        // Users can now be logged in from multiple browsers/tabs simultaneously
        console.log(`📊 Current active sessions: ${Object.keys(activeSessions).length}`);

        const sessionId = generateSessionId();

        // ✅ FIXED: Get client info for session tracking
        const userAgent = ctx.request.headers.get("user-agent") || "Unknown";
        const ipAddress = ctx.request.ip || "Unknown";

        // Create new session (without removing others)
        activeSessions[sessionId] = {
            userId: user.id,
            username: user.username,
            isAdmin: Boolean(user.is_admin),
            loginTime: new Date(),
            lastActivity: new Date(),
            userAgent,
            ipAddress
        };

        console.log(`📊 Active sessions after login: ${Object.keys(activeSessions).length}`);
        console.log(`👤 User ${username} now has ${Object.values(activeSessions).filter(s => s.userId === user.id).length} active session(s)`);

        // Generate JWT
        const token = await generateJWT({
            userId: user.id,
            username: user.username,
            sessionId,
            isAdmin: Boolean(user.is_admin)
        });

        // ✅ FIXED: Use standard cookie name but return session info for frontend
        const isProduction = Deno.env.get('NODE_ENV') === 'production';
        await ctx.cookies.set("auth_token", token, {
            httpOnly: true,
            sameSite: "lax",
            maxAge: 8 * 60 * 60 * 1000, // 8 hours in milliseconds
            secure: isProduction,
            domain: "localhost"
        });

        console.log(`✅ User logged in: ${username} (Session: ${sessionId.substring(0, 8)}...) from ${userAgent.substring(0, 50)}...`);

        ctx.response.status = 200;
        ctx.response.body = { 
            auth_token: token,
            user: {
                id: user.id,
                username: user.username,
                isAdmin: Boolean(user.is_admin)
            },
            sessionId: sessionId, // ✅ FIXED: Return session ID for frontend tracking
        };
    } catch (error) {
        console.error("❌ Login error:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error" };
    }
});

// Logout endpoint
router.post("/api/auth/logout", cookieAuthMiddleware, async (ctx) => {
    try {
        const user = ctx.state.user;
        
        // ✅ FIXED: Only remove the CURRENT session, not all user sessions
        if (user.sessionId && activeSessions[user.sessionId]) {
            delete activeSessions[user.sessionId];
            console.log(`👋 Session ${user.sessionId.substring(0, 8)}... logged out for user: ${user.username}`);
            
            const remainingSessions = Object.values(activeSessions).filter(s => s.userId === user.id).length;
            console.log(`📊 User ${user.username} has ${remainingSessions} remaining active session(s)`);
        }

        // Clear cookie using Oak's cookie API
        await ctx.cookies.delete("auth_token");

        ctx.response.body = { message: "Logout successful" };
    } catch (error) {
        console.error("❌ Logout error:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error" };
    }
});

// Test cookie endpoint - for profile page
router.get("/test_cookie", cookieAuthMiddleware, async (ctx) => {
    try {
        const user = ctx.state.user;
        
        ctx.response.body = { 
            message: 'Token verified successfully', 
            token_data: {
                userId: user.id,
                username: user.username,
                isAdmin: user.isAdmin,
                sessionId: user.sessionId
            }
        };
    } catch (error) {
        console.error("❌ Test cookie error:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error" };
    }
});

// ✅ NEW: Special endpoint to handle multiple sessions
router.post("/api/auth/select-session", async (ctx) => {
    try {
        const body = await ctx.request.body();
        const { sessionId } = await body.value;
        
        if (!sessionId) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Session ID required" };
            return;
        }
        
        // Check if session exists
        const sessionInfo = activeSessions[sessionId];
        if (!sessionInfo) {
            ctx.response.status = 404;
            ctx.response.body = { error: "Session not found" };
            return;
        }
        
        // Generate new token for this specific session
        const token = await generateJWT({
            userId: sessionInfo.userId,
            username: sessionInfo.username,
            sessionId: sessionId,
            isAdmin: sessionInfo.isAdmin
        });
        
        // Set the cookie for this session
        const isProduction = Deno.env.get('NODE_ENV') === 'production';
        await ctx.cookies.set("auth_token", token, {
            httpOnly: true,
            sameSite: "lax",
            maxAge: 8 * 60 * 60 * 1000,
            secure: isProduction,
            domain: "localhost"
        });
        
        ctx.response.body = {
            message: "Session selected successfully",
            user: {
                id: sessionInfo.userId,
                username: sessionInfo.username,
                isAdmin: sessionInfo.isAdmin
            },
            sessionId: sessionId
        };
    } catch (error) {
        console.error("❌ Session selection error:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error" };
    }
});

// ✅ NEW: Get available sessions for user selection
router.get("/api/auth/sessions", async (ctx) => {
    try {
        // Try to get current token to see which user
        const authToken = await ctx.cookies.get("auth_token");
        
        if (!authToken) {
            ctx.response.body = { sessions: [] };
            return;
        }
        
        try {
            const payload = await verify(authToken, secretKey) as JWTPayload;
            
            // Find all sessions for this user
            const userSessions = Object.entries(activeSessions)
                .filter(([_, session]) => session.userId === payload.userId)
                .map(([sessionId, session]) => ({
                    sessionId,
                    username: session.username,
                    loginTime: session.loginTime,
                    lastActivity: session.lastActivity,
                    userAgent: session.userAgent?.substring(0, 100) || "Unknown",
                    isCurrentSession: sessionId === payload.sessionId
                }));
                
            ctx.response.body = {
                sessions: userSessions,
                currentUserId: payload.userId,
                currentUsername: payload.username
            };
        } catch (verifyError) {
            // Token invalid, return empty sessions
            ctx.response.body = { sessions: [] };
        }
    } catch (error) {
        console.error("❌ Get sessions error:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error" };
    }
});

// Create a book
router.post("/api/books", simpleAuthMiddleware, async (ctx) => {
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
router.post("/api/dvds", simpleAuthMiddleware, async (ctx) => {
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
router.post("/api/cds", simpleAuthMiddleware, async (ctx) => {
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
router.post("/api/articles", simpleAuthMiddleware, async (ctx) => {
    try {
        const user = ctx.state.user;
        
        const body = await ctx.request.body();
        const bodyValue = await body.value;
        const { item_type, item_id, description, price } = bodyValue;
        
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

// Get all articles
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

        // Get CDs
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
                book_info: {
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
                dvd_info: {
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
                cd_info: {
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

// Get articles by type
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

// Delete an article
router.delete("/api/articles/:id", cookieAuthMiddleware, async (ctx) => {
    try {
        const articleId = parseInt(ctx.params.id);
        const user = ctx.state.user;
        
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
        const isOwner = article.user_id === user.id;
        
        if (!isOwner && !user.isAdmin) {
            ctx.response.status = 403;
            ctx.response.body = { error: "Forbidden: You can only delete your own articles" };
            return;
        }
        
        // Log admin deletion for auditing
        if (user.isAdmin && !isOwner) {
            console.log(`🚨 ADMIN DELETION: User ${user.username} (ID: ${user.id}) is deleting article ${articleId} owned by user ${article.user_id}`);
        }
        
        // Delete the article (this will cascade delete related chat messages)
        await client.execute(
            "DELETE FROM articles WHERE id = ?",
            [articleId]
        );
        
        console.log(`🗑️ Article ${articleId} deleted by ${user.isAdmin && !isOwner ? 'admin' : 'owner'} ${user.username}`);
        
        ctx.response.status = 200;
        ctx.response.body = {
            message: "Article deleted successfully",
            deletedArticle: {
                id: articleId,
                item_type: article.item_type,
                item_id: article.item_id
            },
            deletedBy: user.isAdmin && !isOwner ? "admin" : "owner"
        };
    } catch (error) {
        console.error("❌ Article deletion error:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error: " + error.message };
    }
});

// Mark an article as sold
router.patch("/api/articles/:id/sold", cookieAuthMiddleware, async (ctx) => {
    try {
        const articleId = parseInt(ctx.params.id);
        const user = ctx.state.user;
        
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
        const isOwner = article.user_id === user.id;
        
        if (!isOwner && !user.isAdmin) {
            ctx.response.status = 403;
            ctx.response.body = { error: "Forbidden: You can only modify your own articles" };
            return;
        }
        
        // Toggle the sold status
        const currentStatus = article.is_sold;
        const newStatus = !currentStatus;
        
        // Log admin action for auditing
        if (user.isAdmin && !isOwner) {
            console.log(`🚨 ADMIN ACTION: User ${user.username} (ID: ${user.id}) is marking article ${articleId} as ${newStatus ? 'sold' : 'available'} (owned by user ${article.user_id})`);
        }
        
        await client.execute(
            "UPDATE articles SET is_sold = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [newStatus, articleId]
        );
        
        console.log(`📦 Article ${articleId} marked as ${newStatus ? 'sold' : 'available'} by ${user.isAdmin && !isOwner ? 'admin' : 'owner'} ${user.username}`);
        
        ctx.response.status = 200;
        ctx.response.body = {
            message: `Article marked as ${newStatus ? 'sold' : 'available'} successfully`,
            article: {
                id: articleId,
                is_sold: newStatus
            },
            actionBy: user.isAdmin && !isOwner ? "admin" : "owner"
        };
    } catch (error) {
        console.error("❌ Article status update error:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Internal server error" };
    }
});

// Get all articles for the current user
router.get("/api/users/me/articles", cookieAuthMiddleware, async (ctx) => {
    try {
        const user = ctx.state.user;
        
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
        `, [user.id]);
        
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

// Chat WebSocket handler
async function handleChatWebSocket(ctx: any) {
    console.log("🔌 Chat WebSocket connection attempt:", ctx.request.url.toString());
    
    try {
        const url = ctx.request.url;
        const pathParts = url.pathname.split('/');
        
        if (pathParts.length < 4 || pathParts[1] !== 'ws' || pathParts[2] !== 'chat') {
            console.log("❌ Invalid WebSocket path format");
            ctx.response.status = 400;
            ctx.response.body = { error: 'Invalid path format' };
            return;
        }
        
        const chatRoomId = pathParts[3];
        const userId = parseInt(url.searchParams.get('userId') || '0');
        
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
            isDirectChat = true;
        } else {
            articleId = parseInt(chatRoomId);
            if (!articleId || isNaN(articleId)) {
                ctx.response.status = 400;
                ctx.response.body = { error: 'Invalid article ID' };
                return;
            }
            
            // Verify article exists
            const articles = await client.query("SELECT id FROM articles WHERE id = ?", [articleId]);
            if (articles.length === 0) {
                ctx.response.status = 404;
                ctx.response.body = { error: 'Article not found' };
                return;
            }
        }

        // Get user info
        const users = await client.query("SELECT username FROM users WHERE id = ?", [userId]);
        if (users.length === 0) {
            ctx.response.status = 404;
            ctx.response.body = { error: 'User not found' };
            return;
        }
        const username = users[0].username;

        // Upgrade to WebSocket
        const socket = ctx.upgrade();
        const clientId = `${userId}_${chatRoomId}_${Date.now()}`;
        let clientData: WebSocketClient;

        socket.onopen = () => {
            clientData = {
                ws: socket,
                userId,
                username,
                articleId: articleId || 0,
                chatRoomId
            };
            
            chatManager.addClient(clientId, clientData);
            
            socket.send(JSON.stringify({
                type: 'connected',
                message: 'Successfully connected to chat',
                chatRoomId,
                isDirectChat
            }));
            
            // Send message history for article-based chats
            if (!isDirectChat && articleId) {
                chatManager.getMessageHistory(articleId).then(history => {
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({
                            type: 'history',
                            messages: history
                        }));
                    }
                });
            } else {
                socket.send(JSON.stringify({
                    type: 'history',
                    messages: []
                }));
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
                const data = JSON.parse(event.data);
                
                switch (data.type) {
                    case 'join':
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
                                // Direct chat - broadcast without saving
                                const message = {
                                    type: 'message',
                                    userId,
                                    username,
                                    message: data.message.trim(),
                                    timestamp: new Date().toISOString(),
                                    chatRoomId,
                                    isDirectChat: true
                                };
                                
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
                                
                                try {
                                    const messageId = await chatManager.saveMessage(message);
                                    message.id = messageId;
                                    
                                    const broadcastMessage = {
                                        type: 'message',
                                        ...message,
                                        userId: message.user_id,
                                        isDirectChat: false
                                    };
                                    
                                    chatManager.broadcastToRoom(chatRoomId, broadcastMessage);
                                } catch (error) {
                                    console.error('❌ Error saving message:', error);
                                    socket.send(JSON.stringify({
                                        type: 'error',
                                        message: 'Failed to save message'
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
                }
            } catch (error) {
                console.error('❌ Error handling WebSocket message:', error);
                socket.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid message format'
                }));
            }
        };

        socket.onclose = () => {
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
        ctx.response.body = { error: "WebSocket connection failed" };
    }
}

// Health check endpoint
router.get("/api/health", (ctx) => {
    ctx.response.body = {
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: client ? "connected" : "disconnected",
        activeSessions: Object.keys(activeSessions).length,
        uniqueUsers: new Set(Object.values(activeSessions).map(s => s.userId)).size
    };
});

// ✅ FIXED: Enhanced debug endpoint to view active sessions
router.get("/api/debug/sessions", (ctx) => {
    const sessionsByUser: { [username: string]: any[] } = {};
    
    Object.entries(activeSessions).forEach(([sessionId, info]) => {
        if (!sessionsByUser[info.username]) {
            sessionsByUser[info.username] = [];
        }
        
        sessionsByUser[info.username].push({
            sessionId: sessionId.substring(0, 8) + "...",
            loginTime: info.loginTime,
            lastActivity: info.lastActivity,
            userAgent: info.userAgent?.substring(0, 50) + "..." || "Unknown",
            ipAddress: info.ipAddress || "Unknown",
            isAdmin: info.isAdmin
        });
    });
    
    ctx.response.body = {
        totalSessions: Object.keys(activeSessions).length,
        uniqueUsers: Object.keys(sessionsByUser).length,
        sessionsByUser,
        summary: Object.entries(sessionsByUser).map(([username, sessions]) => ({
            username,
            sessionCount: sessions.length,
            isAdmin: sessions[0]?.isAdmin || false
        }))
    };
});

// Application setup
const app = new Application();

// Configure cookie keys for signing (optional but recommended)
app.keys = ["your-secret-key-for-cookie-signing"];

// Debug middleware
app.use(async (ctx, next) => {
    const start = Date.now();
    console.log(`🚀 ${ctx.request.method} ${ctx.request.url.pathname}`);
    
    await next();
    
    const ms = Date.now() - start;
    console.log(`✅ ${ctx.request.method} ${ctx.request.url.pathname} - ${ctx.response.status} - ${ms}ms`);
});

// WebSocket middleware
app.use(async (ctx, next) => {
    const path = ctx.request.url.pathname;
    
    // Handle chat WebSocket connections
    if (path.startsWith('/ws/chat/')) {
        const upgrade = ctx.request.headers.get("upgrade");
        if (upgrade?.toLowerCase() !== 'websocket') {
            ctx.response.status = 400;
            ctx.response.body = { error: 'Expected WebSocket upgrade' };
            return;
        }
        
        await handleChatWebSocket(ctx);
        return;
    }
    
    await next();
});

// CORS middleware
app.use(oakCors({
    origin: ["http://localhost:8080", "http://127.0.0.1:8080", "http://localhost:3000"], 
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "Cache-Control"],
    credentials: true,
    optionsSuccessStatus: 200
}));

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

// ✅ FIXED: Enhanced cleanup for expired sessions
function cleanupExpiredSessions() {
    const now = new Date();
    const toRemove: string[] = [];
    
    for (const [sessionId, info] of Object.entries(activeSessions)) {
        const inactiveTime = now.getTime() - info.lastActivity.getTime();
        if (inactiveTime > 8 * 60 * 60 * 1000) { // ✅ FIXED: 8 hours expiry
            toRemove.push(sessionId);
        }
    }
    
    // Group sessions by user for logging
    const userSessionCounts: { [username: string]: number } = {};
    toRemove.forEach(sessionId => {
        const info = activeSessions[sessionId];
        userSessionCounts[info.username] = (userSessionCounts[info.username] || 0) + 1;
        delete activeSessions[sessionId];
    });
    
    // Log cleanup results
    Object.entries(userSessionCounts).forEach(([username, count]) => {
        console.log(`🧹 Cleaned up ${count} expired session(s) for: ${username}`);
    });
    
    if (toRemove.length > 0) {
        console.log(`📊 Total active sessions after cleanup: ${Object.keys(activeSessions).length}`);
    }
}

// Start cleanup every 30 minutes
setInterval(cleanupExpiredSessions, 30 * 60 * 1000);

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
    await initializeChatTables();
    
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log("📚 Available endpoints:");
    console.log("  POST /api/auth/register - Register a new user");
    console.log("  POST /api/auth/login - Login user");
    console.log("  POST /api/auth/logout - Logout current session");
    console.log("  GET  /test_cookie - Test authentication");
    console.log("  GET  /api/health - Health check");
    console.log("  GET  /api/debug/sessions - View active sessions (debug)");
    console.log("  POST /api/books - Create a book");
    console.log("  POST /api/dvds - Create a DVD");
    console.log("  POST /api/cds - Create a CD");
    console.log("  POST /api/articles - Create an article");
    console.log("  GET  /api/articles - Get all articles");
    console.log("  GET  /api/articles/book - Get book articles");
    console.log("  GET  /api/articles/dvd - Get DVD articles");
    console.log("  GET  /api/articles/cd - Get CD articles");
    console.log("  DELETE /api/articles/:id - Delete an article");
    console.log("  PATCH /api/articles/:id/sold - Toggle article sold status");
    console.log("  GET  /api/users/me/articles - Get current user's articles");
    console.log("  WS   /ws/chat/:roomId - WebSocket chat connection");
    console.log("");
    console.log("✅ FIXED: Multiple concurrent sessions per user are now supported");
    console.log("✅ FIXED: Extended session duration to 8 hours");
    console.log("✅ FIXED: Enhanced session tracking with User-Agent and IP");
    console.log("✅ FIXED: Sessions are properly isolated - no cross-account interference");
    console.log("");
    console.log("🌐 Frontend: Open your HTML files in browser");
    console.log("📊 Database: MySQL running in Docker container 'mysql-auth'");
    console.log("🔍 Debug: Visit http://localhost:8000/api/debug/sessions to view active sessions");
    
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