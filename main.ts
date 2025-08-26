// main.ts - Serveur d'authentification et marketplace avec gestion de sessions multi-utilisateurs
import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { oakCors } from "https://deno.land/x/cors@v1.2.2/mod.ts";
import { Client } from "https://deno.land/x/mysql@v2.12.1/mod.ts";
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { create, verify } from "https://deno.land/x/djwt@v3.0.1/mod.ts";

// ==========================================
// CONFIGURATION
// ==========================================

const DB_CONFIG = {
    hostname: "127.0.0.1",
    username: "root",
    password: "mypassword",
    db: "auth_db",
    port: 3306,
};

const JWT_CONFIG = {
    expirationHours: 2
};


const SERVER_PORT = 8000;

// ==========================================
// TYPES ET INTERFACES
// ==========================================

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
    tabId: string;
}

// ==========================================
// VARIABLES GLOBALES
// ==========================================

let client: Client; // Connexion à la base de données
const activeSessions: { [sessionId: string]: SessionInfo } = {};
const userTabSessions: { [tabId: string]: string } = {};

// clé JWT
const secretKey = await crypto.subtle.generateKey(
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign", "verify"]
);

// ==========================================
// GESTIONNAIRE DU CHAT
// ==========================================

class ChatManager {
    private clients: Map<string, WebSocketClient> = new Map();
    private rooms: Map<string, Set<string>> = new Map();

    // Ajouter un client au chat
    addClient(clientId: string, client: WebSocketClient) {
        this.clients.set(clientId, client);
        
        const roomKey = client.chatRoomId || client.articleId.toString();
        
        if (!this.rooms.has(roomKey)) {
            this.rooms.set(roomKey, new Set());
        }
        this.rooms.get(roomKey)!.add(clientId);
    }

    // Supprimer un client du chat
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
        }
    }

    // Diffuser un message à tous les clients d'une salle
    broadcastToRoom(roomKey: string | number, message: any, excludeClientId?: string) {
        const roomKeyStr = roomKey.toString();
        const room = this.rooms.get(roomKeyStr);
        
        if (!room || room.size === 0) return;

        const messageStr = JSON.stringify(message);
        
        room.forEach(clientId => {
            if (clientId === excludeClientId) return;
            
            const client = this.clients.get(clientId);
            if (client && client.ws.readyState === WebSocket.OPEN) {
                try {
                    client.ws.send(messageStr);
                } catch (error) {
                    console.error(`Erreur envoi à ${clientId}:`, error);
                    this.removeClient(clientId);
                }
            }
        });
    }

    // Sauvegarder un message en base de données
    async saveMessage(message: ChatMessage): Promise<number> {
        try {
            const formattedTimestamp = new Date(message.timestamp).toISOString().slice(0, 19).replace('T', ' ');
            
            const result = await client.execute(
                "INSERT INTO chat_messages (article_id, user_id, username, message, timestamp) VALUES (?, ?, ?, ?, ?)",
                [message.article_id, message.user_id, message.username, message.message, formattedTimestamp]
            );
            
            return result.lastInsertId as number;
        } catch (error) {
            console.error('Erreur sauvegarde message:', error);
            throw error;
        }
    }

    // Récupérer l'historique des messages
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
            console.error('Erreur récupération historique:', error);
            return [];
        }
    }
}

const chatManager = new ChatManager();

// ==========================================
// FONCTIONS UTILITAIRES
// ==========================================

// Générer un identifiant de session unique
function generateSessionId(): string {
    return crypto.randomUUID();
}

// Générer un identifiant d'onglet unique
function generateTabId(): string {
    return crypto.randomUUID();
}

// Générer un token JWT
function generateJWT(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
    const fullPayload: JWTPayload = {
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (JWT_CONFIG.expirationHours * 60 * 60),
    };
    return create({ alg: "HS512", typ: "JWT" }, fullPayload, secretKey);
}

// ==========================================
// CONNEXION ET INITIALISATION BASE DE DONNÉES
// ==========================================

async function connectToDatabase() {
    try {
        client = new Client();
        await client.connect(DB_CONFIG);
        return true;
    } catch (error) {
        console.error("Échec de la connexion à la base de données:", error.message);
        return false;
    }
}

async function initializeDatabase() {
    try {
        // utilisateurs
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

        // livres
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

        // DVDs
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

        // CDs
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

        // articles
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

        // messages de chat
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

    } catch (error) {
        console.error("Erreur d'initialisation de la base de données:", error.message);
        throw error;
    }
}

// ==========================================
// MIDDLEWARES D'AUTHENTIFICATION
// ==========================================

// Middleware d'authentification par cookies avec gestion spécifique des onglets
async function cookieAuthMiddleware(ctx: any, next: () => Promise<unknown>) {
    try {
        
        // Récupérer le token d'auth et l'ID d'onglet depuis les cookies
        const authToken = await ctx.cookies.get("auth_token");
        const tabId = await ctx.cookies.get("tab_id");

        if (!authToken) {
            ctx.response.status = 401;
            ctx.response.body = { error: "Non autorisé: Aucun token fourni" };
            return;
        }

        // Vérifier le token JWT
        const payload = await verify(authToken, secretKey) as JWTPayload;
        
        // Vérifier si cet onglet a une session spécifique
        let sessionId = payload.sessionId;
        if (tabId && userTabSessions[tabId]) {
            sessionId = userTabSessions[tabId];
        }
        
        // Vérifier si la session existe
        const sessionInfo = activeSessions[sessionId];
        
        if (!sessionInfo) {
            
            // Nettoyer la session d'onglet orpheline
            if (tabId && userTabSessions[tabId]) {
                delete userTabSessions[tabId];
            }
            
            ctx.response.status = 401;
            ctx.response.body = { error: "Non autorisé: Session expirée" };
            return;
        }

        // Vérifier que la session appartient au même utilisateur (vérification de sécurité)
        if (sessionInfo.userId !== payload.userId) {
            ctx.response.status = 401;
            ctx.response.body = { error: "Non autorisé: Session invalide" };
            return;
        }

        // Mettre à jour la dernière activité
        sessionInfo.lastActivity = new Date();

        // Ajouter les infos utilisateur au contexte
        ctx.state.user = {
            id: payload.userId,
            username: payload.username,
            isAdmin: payload.isAdmin,
            sessionId: sessionId,
            tabId: tabId
        };

        await next();
    } catch (error) {
        console.error("Erreur middleware auth cookies:", error);
        console.error("Détails de l'erreur:", error.message);
        ctx.response.status = 401;
        ctx.response.body = { error: "Non autorisé: Token invalide" };
    }
}

// ==========================================
// GESTIONNAIRE WEBSOCKET POUR LE CHAT
// ==========================================

async function handleChatWebSocket(ctx: any) {
    
    try {
        const url = ctx.request.url;
        const pathParts = url.pathname.split('/');
        
        if (pathParts.length < 4 || pathParts[1] !== 'ws' || pathParts[2] !== 'chat') {
            ctx.response.status = 400;
            ctx.response.body = { error: 'Format de chemin invalide' };
            return;
        }
        
        const chatRoomId = pathParts[3];
        const userId = parseInt(url.searchParams.get('userId') || '0');
        
        if (!chatRoomId || !userId || isNaN(userId)) {
            ctx.response.status = 400;
            ctx.response.body = { error: 'Paramètres invalides' };
            return;
        }

        // Gérer différents types de salles de chat
        let isDirectChat = false;
        let articleId: number | null = null;
        
        if (chatRoomId.startsWith('direct_')) {
            isDirectChat = true;
        } else {
            articleId = parseInt(chatRoomId);
            if (!articleId || isNaN(articleId)) {
                ctx.response.status = 400;
                ctx.response.body = { error: 'ID article invalide' };
                return;
            }
            
            // Vérifier que l'article existe
            const articles = await client.query("SELECT id FROM articles WHERE id = ?", [articleId]);
            if (articles.length === 0) {
                ctx.response.status = 404;
                ctx.response.body = { error: 'Article non trouvé' };
                return;
            }
        }

        // Récupérer les infos utilisateur
        const users = await client.query("SELECT username FROM users WHERE id = ?", [userId]);
        if (users.length === 0) {
            ctx.response.status = 404;
            ctx.response.body = { error: 'Utilisateur non trouvé' };
            return;
        }
        const username = users[0].username;

        // Mettre à niveau vers WebSocket
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
                message: 'Connexion au chat réussie',
                chatRoomId,
                isDirectChat
            }));
            
            // Envoyer l'historique des messages pour les chats basés sur des articles
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

            // Notifier les autres qu'un utilisateur a rejoint
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
                            message: 'Salle de chat rejointe avec succès',
                            chatRoomId,
                            isDirectChat
                        }));
                        break;
                        
                    case 'message':
                        if (data.message && data.message.trim()) {
                            if (isDirectChat) {
                                // Chat direct - diffuser sans sauvegarder
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
                                // Chat basé sur un article - sauvegarder en base de données
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
                                    console.error('Erreur sauvegarde message:', error);
                                    socket.send(JSON.stringify({
                                        type: 'error',
                                        message: 'Échec de la sauvegarde du message'
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
                console.error('Erreur traitement message WebSocket:', error);
                socket.send(JSON.stringify({
                    type: 'error',
                    message: 'Format de message invalide'
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
            console.error(`Erreur WebSocket pour l'utilisateur ${username}:`, error);
            chatManager.removeClient(clientId);
        };
        
    } catch (error) {
        console.error('Erreur dans le gestionnaire WebSocket chat:', error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Échec de la connexion WebSocket" };
    }
}

// ==========================================
// ROUTES D'AUTHENTIFICATION
// ==========================================

const router = new Router();

// Initialisation d'un nouvel onglet
router.post("/api/auth/init-tab", async (ctx) => {
    try {
        const tabId = generateTabId();
        
        // Définir le cookie d'ID d'onglet qui persiste pour la session du navigateur
        await ctx.cookies.set("tab_id", tabId, {
            httpOnly: false, // Permettre l'accès JavaScript pour le debug
            sameSite: "lax",
            secure: false, // Mettre à true en production avec HTTPS
            domain: "localhost"
        });
        
        ctx.response.body = {
            message: "Onglet initialisé avec succès",
            tabId: tabId
        };
    } catch (error) {
        console.error("Erreur initialisation onglet:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur interne du serveur" };
    }
});

// Inscription d'un nouvel utilisateur
router.post("/api/auth/register", async (ctx) => {
    try {
        const body = await ctx.request.body();
        const { username, password } = await body.value;

        // Validation
        if (!username || !password) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Le nom d'utilisateur et le mot de passe sont requis" };
            return;
        }

        if (username.length < 3) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Le nom d'utilisateur doit faire au moins 3 caractères" };
            return;
        }

        if (password.length < 6) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Le mot de passe doit faire au moins 6 caractères" };
            return;
        }

        // Vérifier si l'utilisateur existe déjà
        const existingUser = await client.query(
            "SELECT id FROM users WHERE username = ?",
            [username]
        );

        if (existingUser.length > 0) {
            ctx.response.status = 409;
            ctx.response.body = { error: "Le nom d'utilisateur existe déjà" };
            return;
        }

        // Hacher le mot de passe
        const hashedPassword = await bcrypt.hash(password);

        // Insérer l'utilisateur
        const result = await client.execute(
            "INSERT INTO users (username, password, is_admin) VALUES (?, ?, ?)",
            [username, hashedPassword, false]
        );

        const userId = result.lastInsertId as number;
        const sessionId = generateSessionId();

        // Obtenir ou créer l'ID d'onglet
        let tabId = await ctx.cookies.get("tab_id");
        if (!tabId) {
            tabId = generateTabId();
            await ctx.cookies.set("tab_id", tabId, {
                httpOnly: false,
                sameSite: "lax",
                secure: false,
                domain: "localhost"
            });
        }

        // Obtenir les infos client pour le suivi de session
        const userAgent = ctx.request.headers.get("user-agent") || "Inconnu";
        const ipAddress = ctx.request.ip || "Inconnu";

        // Créer la session
        activeSessions[sessionId] = {
            userId,
            username,
            isAdmin: false,
            loginTime: new Date(),
            lastActivity: new Date(),
            userAgent,
            ipAddress,
            tabId
        };

        // Mapper l'onglet à la session
        userTabSessions[tabId] = sessionId;

        // Générer le JWT
        const token = await generateJWT({
            userId,
            username,
            sessionId,
            isAdmin: false
        });

        // Définir le cookie de token d'auth
        const isProduction = Deno.env.get('NODE_ENV') === 'production';
        await ctx.cookies.set("auth_token", token, {
            httpOnly: true,
            sameSite: "lax",
            maxAge: JWT_CONFIG.expirationHours * 60 * 60 * 1000,
            secure: isProduction,
            domain: "localhost"
        });

        ctx.response.status = 201;
        ctx.response.body = {
            message: "Utilisateur inscrit avec succès",
            user: {
                id: userId,
                username,
                isAdmin: false
            },
            sessionId: sessionId,
            tabId: tabId
        };
    } catch (error) {
        console.error("Erreur inscription:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur interne du serveur: " + error.message };
    }
});

// Connexion d'un utilisateur
router.post("/api/auth/login", async (ctx) => {
    try {
        const body = await ctx.request.body();
        const { username, password } = await body.value;

        // Rechercher l'utilisateur en base de données
        const users = await client.query(
            "SELECT id, username, password, is_admin FROM users WHERE username = ?",
            [username]
        );

        if (users.length === 0) {
            ctx.response.status = 401;
            ctx.response.body = { error: "Nom d'utilisateur ou mot de passe invalide" };
            return;
        }

        const user = users[0] as any;

        // Vérifier le mot de passe
        const result = await bcrypt.compare(password, user.password);
        if (!result) {
            ctx.response.status = 401;
            ctx.response.body = { error: "Nom d'utilisateur ou mot de passe invalide" };
            return;
        }

        // Obtenir ou créer l'ID d'onglet
        let tabId = await ctx.cookies.get("tab_id");
        if (!tabId) {
            tabId = generateTabId();
            await ctx.cookies.set("tab_id", tabId, {
                httpOnly: false,
                sameSite: "lax",
                secure: false,
                domain: "localhost"
            });
        }

        // Vérifier si cet onglet a déjà une session pour un utilisateur différent
        if (userTabSessions[tabId]) {
            const existingSessionId = userTabSessions[tabId];
            const existingSession = activeSessions[existingSessionId];
            
            if (existingSession && existingSession.userId !== user.id) {
                // Ne pas supprimer l'ancienne session, juste la démapper de cet onglet
                delete userTabSessions[tabId];
            }
        }

        const sessionId = generateSessionId();

        // Obtenir les infos client pour le suivi de session
        const userAgent = ctx.request.headers.get("user-agent") || "Inconnu";
        const ipAddress = ctx.request.ip || "Inconnu";

        // Créer une nouvelle session
        activeSessions[sessionId] = {
            userId: user.id,
            username: user.username,
            isAdmin: Boolean(user.is_admin),
            loginTime: new Date(),
            lastActivity: new Date(),
            userAgent,
            ipAddress,
            tabId
        };

        // Mapper cet onglet à la nouvelle session
        userTabSessions[tabId] = sessionId;

        // Générer le JWT
        const token = await generateJWT({
            userId: user.id,
            username: user.username,
            sessionId,
            isAdmin: Boolean(user.is_admin)
        });

        // Définir le cookie de token d'auth
        const isProduction = Deno.env.get('NODE_ENV') === 'production';
        await ctx.cookies.set("auth_token", token, {
            httpOnly: true,
            sameSite: "lax",
            maxAge: JWT_CONFIG.expirationHours * 60 * 60 * 1000,
            secure: isProduction,
            domain: "localhost"
        });

        ctx.response.status = 200;
        ctx.response.body = { 
            auth_token: token,
            user: {
                id: user.id,
                username: user.username,
                isAdmin: Boolean(user.is_admin)
            },
            sessionId: sessionId,
            tabId: tabId
        };
    } catch (error) {
        console.error("Erreur connexion:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur interne du serveur" };
    }
});

// Déconnexion d'un utilisateur
router.post("/api/auth/logout", cookieAuthMiddleware, async (ctx) => {
    try {
        const user = ctx.state.user;
        
        // Nettoyer la session actuelle
        if (user.sessionId && activeSessions[user.sessionId]) {
            delete activeSessions[user.sessionId];
        }

        // Nettoyer le mapping d'onglet
        if (user.tabId && userTabSessions[user.tabId]) {
            delete userTabSessions[user.tabId];
        }

        // Effacer les cookies
        await ctx.cookies.delete("auth_token");
        await ctx.cookies.delete("tab_id");

        ctx.response.body = { message: "Déconnexion réussie" };
    } catch (error) {
        console.error("Erreur déconnexion:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur interne du serveur" };
    }
});

// Test de vérification des cookies - pour la page de profil
router.get("/test_cookie", cookieAuthMiddleware, async (ctx) => {
    try {
        const user = ctx.state.user;
        
        ctx.response.body = { 
            message: 'Token vérifié avec succès', 
            token_data: {
                userId: user.id,
                username: user.username,
                isAdmin: user.isAdmin,
                sessionId: user.sessionId,
                tabId: user.tabId
            }
        };
    } catch (error) {
        console.error("Erreur test cookie:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur interne du serveur" };
    }
});

// ==========================================
// ROUTES DE GESTION DES ARTICLES
// ==========================================

// Créer un livre
router.post("/api/books", cookieAuthMiddleware, async (ctx) => {
    try {
        const body = await ctx.request.body();
        const { title, author, publication_date, genre } = await body.value;

        if (!title || !author) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Le titre et l'auteur sont requis" };
            return;
        }

        const result = await client.execute(
            "INSERT INTO books (title, author, publication_date, genre) VALUES (?, ?, ?, ?)",
            [title, author, publication_date || null, genre || null]
        );

        ctx.response.status = 201;
        ctx.response.body = {
            message: "Livre créé avec succès",
            book: {
                id: result.lastInsertId,
                title,
                author,
                publication_date,
                genre,
            },
        };
    } catch (error) {
        console.error("Erreur création livre:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur interne du serveur" };
    }
});

// Créer un DVD
router.post("/api/dvds", cookieAuthMiddleware, async (ctx) => {
    try {
        const body = await ctx.request.body();
        const { title, publication_date, director, genre } = await body.value;

        if (!title || !director) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Le titre et le réalisateur sont requis" };
            return;
        }

        const result = await client.execute(
            "INSERT INTO dvds (title, publication_date, director, genre) VALUES (?, ?, ?, ?)",
            [title, publication_date || null, director, genre || null]
        );

        ctx.response.status = 201;
        ctx.response.body = {
            message: "DVD créé avec succès",
            dvd: {
                id: result.lastInsertId,
                title,
                publication_date,
                director,
                genre,
            },
        };
    } catch (error) {
        console.error("Erreur création DVD:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur interne du serveur" };
    }
});

// Créer un CD
router.post("/api/cds", cookieAuthMiddleware, async (ctx) => {
    try {
        const body = await ctx.request.body();
        const { author, publication_date, genre } = await body.value;

        if (!author) {
            ctx.response.status = 400;
            ctx.response.body = { error: "L'auteur est requis" };
            return;
        }

        const result = await client.execute(
            "INSERT INTO cds (author, publication_date, genre) VALUES (?, ?, ?)",
            [author, publication_date || null, genre || null]
        );

        ctx.response.status = 201;
        ctx.response.body = {
            message: "CD créé avec succès",
            cd: {
                id: result.lastInsertId,
                author,
                publication_date,
                genre,
            },
        };
    } catch (error) {
        console.error("Erreur création CD:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur interne du serveur" };
    }
});

// Créer un article de marketplace
router.post("/api/articles", cookieAuthMiddleware, async (ctx) => {
    try {
        const user = ctx.state.user;
        
        const body = await ctx.request.body();
        const bodyValue = await body.value;
        const { item_type, item_id, description, price } = bodyValue;
        
        // Validation
        if (!item_type || !item_id || price === undefined || price === null) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Le type d'article, l'ID de l'article et le prix sont requis" };
            return;
        }

        if (!['book', 'dvd', 'cd'].includes(item_type)) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Le type d'article doit être 'book', 'dvd' ou 'cd'" };
            return;
        }

        const priceNum = parseFloat(price);
        if (isNaN(priceNum) || priceNum <= 0) {
            ctx.response.status = 400;
            ctx.response.body = { error: "Le prix doit être un nombre valide supérieur à 0" };
            return;
        }

        // Vérifier que l'article existe
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
            console.error("Erreur base de données vérification article:", dbError);
            ctx.response.status = 500;
            ctx.response.body = { error: "Erreur base de données lors de la vérification de l'article" };
            return;
        }

        if (!itemExists) {
            ctx.response.status = 404;
            ctx.response.body = { error: `${item_type} avec l'ID ${item_id} non trouvé` };
            return;
        }

        // Créer l'article
        try {
            const result = await client.execute(
                "INSERT INTO articles (user_id, item_type, item_id, description, price) VALUES (?, ?, ?, ?, ?)",
                [user.id, item_type, item_id, description || null, priceNum]
            );

            ctx.response.status = 201;
            ctx.response.body = {
                message: "Article créé avec succès",
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
            console.error("Erreur base de données création article:", dbError);
            ctx.response.status = 500;
            ctx.response.body = { error: "Erreur base de données lors de la création de l'article" };
            return;
        }
        
    } catch (error) {
        console.error("Erreur création article:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur interne du serveur: " + error.message };
    }
});

// Récupérer tous les articles
router.get("/api/articles", async (ctx) => {
    try {
        // Récupérer les articles de livres
        const bookArticles = await client.query(`
            SELECT 
                a.id, a.user_id, a.item_type, a.item_id, a.description, a.price, a.is_sold, a.created_at, a.updated_at,
                b.title, b.author, b.publication_date, b.genre,
                u.username as seller_username
            FROM articles a
            JOIN books b ON a.item_id = b.id
            JOIN users u ON a.user_id = u.id
            WHERE a.item_type = 'book'
        `);

        // Récupérer les articles de DVDs
        const dvdArticles = await client.query(`
            SELECT 
                a.id, a.user_id, a.item_type, a.item_id, a.description, a.price, a.is_sold, a.created_at, a.updated_at,
                d.title, d.director, d.publication_date, d.genre,
                u.username as seller_username
            FROM articles a
            JOIN dvds d ON a.item_id = d.id
            JOIN users u ON a.user_id = u.id
            WHERE a.item_type = 'dvd'
        `);

        // Récupérer les articles de CDs
        const cdArticles = await client.query(`
            SELECT 
                a.id, a.user_id, a.item_type, a.item_id, a.description, a.price, a.is_sold, a.created_at, a.updated_at,
                c.author, c.publication_date, c.genre,
                u.username as seller_username
            FROM articles a
            JOIN cds c ON a.item_id = c.id
            JOIN users u ON a.user_id = u.id
            WHERE a.item_type = 'cd'
        `);

        // Formater tous les articles avec une structure cohérente
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

        // Trier par date de création (plus récent en premier)
        allArticles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        ctx.response.body = {
            message: "Tous les articles récupérés avec succès",
            articles: allArticles
        };
    } catch (error) {
        console.error("Erreur récupération tous les articles:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur interne du serveur" };
    }
});

// Récupérer les articles par type
router.get("/api/articles/book", async (ctx) => {
    try {
        const articles = await client.query(`
            SELECT 
                a.id, a.user_id, a.item_type, a.item_id, a.description, a.price, a.is_sold, a.created_at, a.updated_at,
                b.title, b.author, b.publication_date, b.genre,
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
            message: "Articles de livres récupérés avec succès",
            articles: formattedArticles
        };
    } catch (error) {
        console.error("Erreur récupération articles livres:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur interne du serveur" };
    }
});

router.get("/api/articles/dvd", async (ctx) => {
    try {
        const articles = await client.query(`
            SELECT 
                a.id, a.user_id, a.item_type, a.item_id, a.description, a.price, a.is_sold, a.created_at, a.updated_at,
                d.title, d.director, d.publication_date, d.genre,
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
            message: "Articles de DVDs récupérés avec succès",
            articles: formattedArticles
        };
    } catch (error) {
        console.error("Erreur récupération articles DVDs:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur interne du serveur" };
    }
});

router.get("/api/articles/cd", async (ctx) => {
    try {
        const articles = await client.query(`
            SELECT 
                a.id, a.user_id, a.item_type, a.item_id, a.description, a.price, a.is_sold, a.created_at, a.updated_at,
                c.author, c.publication_date, c.genre,
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
            message: "Articles de CDs récupérés avec succès",
            articles: formattedArticles
        };
    } catch (error) {
        console.error("Erreur récupération articles CDs:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur interne du serveur" };
    }
});

// Supprimer un article
router.delete("/api/articles/:id", cookieAuthMiddleware, async (ctx) => {
    try {
        const articleId = parseInt(ctx.params.id);
        const user = ctx.state.user;
        
        if (!articleId || isNaN(articleId)) {
            ctx.response.status = 400;
            ctx.response.body = { error: "ID d'article invalide" };
            return;
        }
        
        // Vérifier si l'article existe
        const articles = await client.query(
            "SELECT * FROM articles WHERE id = ?",
            [articleId]
        );
        
        if (articles.length === 0) {
            ctx.response.status = 404;
            ctx.response.body = { error: "Article non trouvé" };
            return;
        }
        
        const article = articles[0];
        
        // Vérifier les permissions: soit propriétaire SOIT admin
        const isOwner = article.user_id === user.id;
        
        if (!isOwner && !user.isAdmin) {
            ctx.response.status = 403;
            ctx.response.body = { error: "Interdit: Vous ne pouvez supprimer que vos propres articles" };
            return;
        }
        
        // Supprimer l'article (ceci supprimera en cascade les messages de chat associés)
        await client.execute(
            "DELETE FROM articles WHERE id = ?",
            [articleId]
        );
        
        ctx.response.status = 200;
        ctx.response.body = {
            message: "Article supprimé avec succès",
            deletedArticle: {
                id: articleId,
                item_type: article.item_type,
                item_id: article.item_id
            },
            deletedBy: user.isAdmin && !isOwner ? "admin" : "propriétaire"
        };
    } catch (error) {
        console.error("Erreur suppression article:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur interne du serveur: " + error.message };
    }
});

// Marquer un article comme vendu
router.patch("/api/articles/:id/sold", cookieAuthMiddleware, async (ctx) => {
    try {
        const articleId = parseInt(ctx.params.id);
        const user = ctx.state.user;
        
        if (!articleId || isNaN(articleId)) {
            ctx.response.status = 400;
            ctx.response.body = { error: "ID d'article invalide" };
            return;
        }
        
        // Vérifier si l'article existe
        const articles = await client.query(
            "SELECT * FROM articles WHERE id = ?",
            [articleId]
        );
        
        if (articles.length === 0) {
            ctx.response.status = 404;
            ctx.response.body = { error: "Article non trouvé" };
            return;
        }
        
        const article = articles[0];
        
        // Vérifier les permissions: soit propriétaire SOIT admin
        const isOwner = article.user_id === user.id;
        
        if (!isOwner && !user.isAdmin) {
            ctx.response.status = 403;
            ctx.response.body = { error: "Interdit: Vous ne pouvez modifier que vos propres articles" };
            return;
        }
        
        // Basculer le statut vendu
        const currentStatus = article.is_sold;
        const newStatus = !currentStatus;
        
        await client.execute(
            "UPDATE articles SET is_sold = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            [newStatus, articleId]
        );
        
        ctx.response.status = 200;
        ctx.response.body = {
            message: `Article marqué comme ${newStatus ? 'vendu' : 'disponible'} avec succès`,
            article: {
                id: articleId,
                is_sold: newStatus
            },
            actionBy: user.isAdmin && !isOwner ? "admin" : "propriétaire"
        };
    } catch (error) {
        console.error("Erreur mise à jour statut article:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur interne du serveur" };
    }
});

// Récupérer tous les articles de l'utilisateur actuel
router.get("/api/users/me/articles", cookieAuthMiddleware, async (ctx) => {
    try {
        const user = ctx.state.user;
        
        // Récupérer tous les articles de l'utilisateur
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
            message: "Articles de l'utilisateur récupérés avec succès",
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
        console.error("Erreur récupération articles utilisateur:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur interne du serveur" };
    }
});

// Récupérer les messages d'un article
router.get("/api/articles/:id/messages", cookieAuthMiddleware, async (ctx) => {
    try {
        const articleId = parseInt(ctx.params.id);
        
        if (!articleId || isNaN(articleId)) {
            ctx.response.status = 400;
            ctx.response.body = { error: "ID d'article invalide" };
            return;
        }
        
        const messages = await chatManager.getMessageHistory(articleId);
        
        ctx.response.body = {
            message: "Messages de l'article récupérés avec succès",
            messages: messages
        };
    } catch (error) {
        console.error("❌ Erreur récupération messages article:", error);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur interne du serveur" };
    }
});

// ==========================================
// ROUTES UTILITAIRES
// ==========================================

// Vérification de l'état de santé du serveur
router.get("/api/health", (ctx) => {
    ctx.response.body = {
        status: "sain",
        timestamp: new Date().toISOString(),
        database: client ? "connecté" : "déconnecté",
        activeSessions: Object.keys(activeSessions).length,
        uniqueUsers: new Set(Object.values(activeSessions).map(s => s.userId)).size,
        tabSessions: Object.keys(userTabSessions).length
    };
});

// Endpoint de debug pour visualiser les sessions actives avec infos d'onglets
router.get("/api/debug/sessions", (ctx) => {
    const sessionsByUser: { [username: string]: any[] } = {};
    
    Object.entries(activeSessions).forEach(([sessionId, info]) => {
        if (!sessionsByUser[info.username]) {
            sessionsByUser[info.username] = [];
        }
        
        sessionsByUser[info.username].push({
            sessionId: sessionId.substring(0, 8) + "...",
            tabId: info.tabId ? info.tabId.substring(0, 8) + "..." : "Inconnu",
            loginTime: info.loginTime,
            lastActivity: info.lastActivity,
            userAgent: info.userAgent?.substring(0, 50) + "..." || "Inconnu",
            ipAddress: info.ipAddress || "Inconnu",
            isAdmin: info.isAdmin
        });
    });
    
    const tabMappings = Object.entries(userTabSessions).map(([tabId, sessionId]) => ({
        tabId: tabId.substring(0, 8) + "...",
        sessionId: sessionId.substring(0, 8) + "..."
    }));
    
    ctx.response.body = {
        totalSessions: Object.keys(activeSessions).length,
        uniqueUsers: Object.keys(sessionsByUser).length,
        totalTabMappings: Object.keys(userTabSessions).length,
        sessionsByUser,
        tabMappings,
        summary: Object.entries(sessionsByUser).map(([username, sessions]) => ({
            username,
            sessionCount: sessions.length,
            isAdmin: sessions[0]?.isAdmin || false
        }))
    };
});

// ==========================================
// CONFIGURATION DE L'APPLICATION
// ==========================================

const app = new Application();

// Configurer les clés de cookies pour la signature
app.keys = ["votre-clé-secrète-pour-signature-cookies"];

// Middleware de debug
app.use(async (ctx, next) => {
    const start = Date.now();
    
    await next();
    
    const ms = Date.now() - start;
});

// Middleware WebSocket
app.use(async (ctx, next) => {
    const path = ctx.request.url.pathname;
    
    // Gérer les connexions WebSocket de chat
    if (path.startsWith('/ws/chat/')) {
        const upgrade = ctx.request.headers.get("upgrade");
        if (upgrade?.toLowerCase() !== 'websocket') {
            ctx.response.status = 400;
            ctx.response.body = { error: 'Mise à niveau WebSocket attendue' };
            return;
        }
        
        await handleChatWebSocket(ctx);
        return;
    }
    
    await next();
});

// Middleware CORS
app.use(oakCors({
    origin: ["https://localhost:8080", "https://127.0.0.1:8080", "https://localhost:3000"], 
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "Cache-Control"],
    credentials: true,
    optionsSuccessStatus: 200,
    preflightContinue: false
}));

// Middleware du routeur
app.use(router.routes());
app.use(router.allowedMethods());

// Middleware de gestion d'erreurs
app.use(async (ctx, next) => {
    try {
        await next();
    } catch (err) {
        console.error("Erreur non gérée:", err);
        ctx.response.status = 500;
        ctx.response.body = { error: "Erreur interne du serveur" };
    }
});

// ==========================================
// FONCTIONS DE NETTOYAGE
// ==========================================

// Nettoyage amélioré pour les sessions expirées et les mappings d'onglets
function cleanupExpiredSessions() {
    const now = new Date();
    const toRemove: string[] = [];
    const orphanedTabs: string[] = [];
    
    // Trouver les sessions expirées
    for (const [sessionId, info] of Object.entries(activeSessions)) {
        const inactiveTime = now.getTime() - info.lastActivity.getTime();
        if (inactiveTime > JWT_CONFIG.expirationHours * 60 * 60 * 1000) { // Expiration en heures
            toRemove.push(sessionId);
        }
    }
    
    // Supprimer les sessions expirées
    const userSessionCounts: { [username: string]: number } = {};
    toRemove.forEach(sessionId => {
        const info = activeSessions[sessionId];
        userSessionCounts[info.username] = (userSessionCounts[info.username] || 0) + 1;
        delete activeSessions[sessionId];
    });
    
    // Nettoyer les mappings d'onglets orphelins
    for (const [tabId, sessionId] of Object.entries(userTabSessions)) {
        if (!activeSessions[sessionId]) {
            orphanedTabs.push(tabId);
        }
    }
    
    orphanedTabs.forEach(tabId => {
        delete userTabSessions[tabId];
    });
}

// Démarrer le nettoyage toutes les 30 minutes
setInterval(cleanupExpiredSessions, 30 * 60 * 1000);

// Nettoyage supplémentaire à la fermeture d'onglet de navigateur (détecter les onglets orphelins)
function cleanupOrphanedTabs() {
    const orphanedTabs: string[] = [];
    
    for (const [tabId, sessionId] of Object.entries(userTabSessions)) {
        const session = activeSessions[sessionId];
        if (!session || session.tabId !== tabId) {
            orphanedTabs.push(tabId);
        }
    }
    
    orphanedTabs.forEach(tabId => {
        delete userTabSessions[tabId];
    });
}

// Exécuter le nettoyage des onglets toutes les 5 minutes
setInterval(cleanupOrphanedTabs, 5 * 60 * 1000);

// ==========================================
// DÉMARRAGE DU SERVEUR
// ==========================================

async function startServer() {
    
    // Se connecter à la base de données
    const connected = await connectToDatabase();
    if (!connected) {
        Deno.exit(1);
    }
    
    // Initialiser la base de données
    await initializeDatabase();

    const cert = await Deno.readTextFile("./certs/server.crt");
    const key = await Deno.readTextFile("./certs/server.key");
    
    await app.listen({ 
    port: SERVER_PORT,
    secure: true,
    cert: cert,
    key: key
});
}

// Gérer l'arrêt
addEventListener("unload", async () => {
    if (client) {
        await client.close();
    }
});

// Démarrer le serveur
startServer().catch(console.error);