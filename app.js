import express from 'express';
import session from 'express-session';
import sqlite3 from 'sqlite3';
import pkg from 'pg';
const { Client } = pkg;
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const hotelName = process.env.HOTEL_NAME || "Гостиница 'Hotel 777'";
const hotelAddress = process.env.HOTEL_ADDR || "Гудаутский район, село Мгудзырхуа, Набережная улица, 1";
const hotelPhone = process.env.HOTEL_PHONE || "+7 (940) 925-00-77";

// Создаем необходимые папки
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(__dirname, 'public', 'uploads');
const imagesDir = path.join(__dirname, 'public', 'images');

[dataDir, uploadsDir, imagesDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
    }
});

let db;
let dbType = 'sqlite';

// Инициализация базы данных
if (process.env.bddata === 'postgresql') {
    const dbConfig = {
        host: process.env.PG_HOST || 'localhost',
        port: process.env.PG_PORT || 5432,
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        database: process.env.PG_DB || 'hotel_db'
    };
    
    if (dbConfig.user && dbConfig.password && dbConfig.database) {
        try {
            db = new Client(dbConfig);
            await db.connect();
            dbType = 'postgresql';
            console.log('Connected to PostgreSQL');
        } catch (error) {
            console.log('PostgreSQL connection failed, using SQLite:', error.message);
            initSQLite();
        }
    } else {
        console.log('PostgreSQL config incomplete, using SQLite');
        initSQLite();
    }
} else {
    initSQLite();
}

function initSQLite() {
    const sqlitePath = process.env.SQLITE_PATH || path.join(dataDir, 'hotel.db');
    db = new sqlite3.Database(sqlitePath, (err) => {
        if (err) {
            console.error('Error opening SQLite database:', err);
        } else {
            console.log(`Connected to SQLite database at: ${sqlitePath}`);
            db.run('PRAGMA foreign_keys = ON');
            db.run('PRAGMA journal_mode = WAL');
        }
    });
}

// Middleware
app.use(express.static('public'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(session({
    secret: 'hotel-booking-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// Функции для работы с БД
function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (dbType === 'postgresql') {
            db.query(sql, params, (err, result) => {
                if (err) reject(err);
                else resolve(result);
            });
        } else {
            db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        }
    });
}

function selectQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (dbType === 'postgresql') {
            db.query(sql, params, (err, result) => {
                if (err) reject(err);
                else resolve(result.rows);
            });
        } else {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        }
    });
}

// Middleware для проверки авторизации с перенаправлением
function requireAuth(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        if (req.headers['hx-request']) {
            res.status(401).json({ error: 'Требуется авторизация' });
        } else {
            res.redirect('/login');
        }
    }
}

// Middleware для проверки авторизации API (без перенаправления)
function requireAuthApi(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.status(401).json({ error: 'Требуется авторизация' });
    }
}

// Функции для рендеринга HTML
function renderRoomCard(room) {
    const statusText = {
        'vip': 'VIP',
        'standard': 'Стандарт', 
        'economy': 'Эконом'
    }[room.status] || room.status;

    const statusClass = {
        'vip': 'vip-enhanced',
        'standard': 'standard-enhanced',
        'economy': 'economy-enhanced'
    }[room.status] || 'standard-enhanced';

    const wrapperClass = room.status === 'vip' ? 'room-card-wrapper vip-special' : 'room-card-wrapper';

    return `
        <div class="col-md-6 col-lg-4 mb-4 fade-in-up-enhanced">
            <div class="${wrapperClass}">
                <div class="room-card-enhanced">
                    <div class="image-container position-relative overflow-hidden">
                        <img src="${room.main_image || '/images/room-placeholder.jpg'}" 
                             class="room-image-enhanced w-100" 
                             alt="Номер ${room.room_number}"
                             onerror="this.src='/images/room-placeholder.jpg'">
                        <div class="position-absolute top-0 end-0 m-3">
                            <span class="status-badge-enhanced status-${statusClass}">${statusText}</span>
                        </div>
                        <div class="position-absolute bottom-0 start-0 m-3">
                            <span class="building-badge-enhanced">
                                <i class="fas fa-building me-1"></i>Корпус ${room.building}
                            </span>
                        </div>
                    </div>
                    
                    <div class="room-content-enhanced">
                        <h5 class="room-title-enhanced">Номер ${room.room_number}</h5>
                        <p class="room-description-enhanced">${room.description || 'Комфортабельный номер со всеми удобствами для идеального отдыха'}</p>
                        
                        <div class="amenities-list-enhanced">
                            ${room.double_beds > 0 ? `<span class="amenity-item-enhanced"><i class="fas fa-bed text-primary"></i> ${room.double_beds} двуспальная</span>` : ''}
                            ${room.single_beds > 0 ? `<span class="amenity-item-enhanced"><i class="fas fa-bed text-info"></i> ${room.single_beds} односпальная</span>` : ''}
                            ${room.rooms_count > 1 ? `<span class="amenity-item-enhanced"><i class="fas fa-door-open text-success"></i> ${room.rooms_count} комн.</span>` : ''}
                        </div>

                        <div class="features-grid-enhanced">
                            ${room.kettle ? '<div class="feature-item-enhanced" title="Чайник"><i class="fas fa-mug-hot"></i></div>' : ''}
                            ${room.tv ? '<div class="feature-item-enhanced" title="Телевизор"><i class="fas fa-tv"></i></div>' : ''}
                            ${room.balcony ? '<div class="feature-item-enhanced" title="Балкон"><i class="fas fa-home"></i></div>' : ''}
                            ${room.air_conditioning ? '<div class="feature-item-enhanced" title="Кондиционер"><i class="fas fa-wind"></i></div>' : ''}
                        </div>

                        <div class="d-flex justify-content-between align-items-center mt-auto pt-3 border-top border-sand">
                            <div class="price-section-enhanced">
                                <span class="price-tag-enhanced">${parseInt(room.price_per_night).toLocaleString()} ₽</span>
                                <small class="price-period-enhanced d-block">за сутки</small>
                            </div>
                            <button class="btn btn-book-enhanced" 
                                    onclick="showBookingModal(${room.id}, 'Корпус ${room.building}, №${room.room_number}', '${room.main_image || '/images/room-placeholder.jpg'}')">
                                <i class="fas fa-calendar-check me-1"></i>Забронировать
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderAdminBookingCard(booking) {
    return `
        <div class="booking-card card mb-4 fade-in-up">
            <div class="card-body">
                <div class="row align-items-center">
                    <div class="col-md-2">
                        <img src="${booking.main_image || '/images/room-placeholder.jpg'}" 
                             class="booking-image img-fluid rounded" 
                             alt="Номер ${booking.room_number}"
                             onerror="this.src='/images/room-placeholder.jpg'">
                    </div>
                    <div class="col-md-6">
                        <div class="d-flex align-items-center mb-2">
                            <div class="client-avatar bg-primary rounded-circle d-flex align-items-center justify-content-center me-3">
                                <i class="fas fa-user text-white"></i>
                            </div>
                            <div>
                                <h5 class="card-title mb-0">${booking.client_surname} ${booking.client_name} ${booking.client_patronymic || ''}</h5>
                                <small class="text-muted">Заявка от ${new Date(booking.created_at).toLocaleDateString()}</small>
                            </div>
                        </div>
                        
                        <div class="booking-details">
                            <div class="detail-item">
                                <i class="fas fa-phone text-muted me-2"></i>
                                <span>${booking.client_phone}</span>
                            </div>
                            <div class="detail-item">
                                <i class="fas fa-envelope text-muted me-2"></i>
                                <span>${booking.client_email || 'Не указан'}</span>
                            </div>
                            <div class="detail-item">
                                <i class="fas fa-calendar text-muted me-2"></i>
                                <span>${booking.checkin_date} - ${booking.checkout_date}</span>
                            </div>
                            <div class="detail-item">
                                <i class="fas fa-bed text-muted me-2"></i>
                                <span>Корпус ${booking.building}, №${booking.room_number}</span>
                            </div>
                            <div class="detail-item">
                                <i class="fas fa-ruble-sign text-muted me-2"></i>
                                <span>${parseInt(booking.price_per_night).toLocaleString()} ₽/сутки</span>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="action-buttons">
                            <button class="btn btn-success btn-approve mb-2 w-100" 
                                    hx-post="/api/admin/bookings/${booking.id}/approve" 
                                    hx-target="#requests-content"
                                    hx-confirm="Вы уверены, что хотите одобрить эту заявку?">
                                <i class="fas fa-check me-1"></i>Одобрить
                            </button>
                            <button class="btn btn-warning btn-reject w-100" 
                                    onclick="showRejectModal(${booking.id})">
                                <i class="fas fa-times me-1"></i>Отклонить
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderRoomManagementRow(room) {
    const statusText = {
        'vip': 'VIP',
        'standard': 'Стандарт',
        'economy': 'Эконом'
    }[room.status] || room.status;

    return `
        <tr class="fade-in-up">
            <td>
                <div class="room-thumbnail position-relative">
                    <img src="${room.main_image || '/images/room-placeholder.jpg'}" 
                         class="img-thumbnail room-management-image" 
                         onerror="this.src='/images/room-placeholder.jpg'"
                         alt="Номер ${room.room_number}">
                    ${room.images_count > 1 ? `
                        <span class="badge bg-info position-absolute top-0 start-0 m-1">
                            <i class="fas fa-images"></i> ${room.images_count}
                        </span>
                    ` : ''}
                </div>
            </td>
            <td class="fw-bold">${room.building}</td>
            <td class="fw-semibold">${room.room_number}</td>
            <td>
                <span class="status-indicator status-${room.status}">
                    ${statusText}
                </span>
            </td>
            <td class="price-cell">
                <span class="price-value">${parseInt(room.price_per_night).toLocaleString()}</span>
                <small class="text-muted d-block">₽/сутки</small>
            </td>
            <td>
                <div class="features-compact">
                    ${room.kettle ? '<i class="fas fa-mug-hot feature-active" title="Чайник"></i>' : '<i class="fas fa-mug-hot feature-inactive"></i>'}
                    ${room.tv ? '<i class="fas fa-tv feature-active" title="Телевизор"></i>' : '<i class="fas fa-tv feature-inactive"></i>'}
                    ${room.balcony ? '<i class="fas fa-home feature-active" title="Балкон"></i>' : '<i class="fas fa-home feature-inactive"></i>'}
                    ${room.air_conditioning ? '<i class="fas fa-wind feature-active" title="Кондиционер"></i>' : '<i class="fas fa-wind feature-inactive"></i>'}
                </div>
            </td>
            <td>
                <div class="action-buttons-compact">
                    <button class="btn btn-outline-primary btn-sm me-1" onclick="showRoomModal(${room.id})" title="Редактировать">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-outline-danger btn-sm" 
                            onclick="deleteRoom(${room.id}, 'Корпус ${room.building}, №${room.room_number}')"
                            title="Удалить">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `;
}

// Инициализация базы данных
async function initDatabase() {
    try {
        console.log('Initializing database...');

        const tables = ['bookings', 'clients', 'room_images', 'rooms', 'users'];
        for (const table of tables) {
            try {
                await runQuery(`DROP TABLE IF EXISTS ${table}`);
            } catch (error) {
                console.log(`Could not drop table ${table}:`, error.message);
            }
        }

        // Создаем таблицы
        const usersTable = `
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                surname TEXT NOT NULL,
                name TEXT NOT NULL,
                patronymic TEXT,
                login TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL,
                position TEXT NOT NULL,
                last_success_login DATETIME,
                last_failed_login DATETIME,
                password_change_date DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        const roomsTable = `
            CREATE TABLE rooms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                building TEXT NOT NULL,
                room_number TEXT NOT NULL,
                double_beds INTEGER DEFAULT 0,
                single_beds INTEGER DEFAULT 0,
                kettle BOOLEAN DEFAULT 0,
                tv BOOLEAN DEFAULT 0,
                balcony BOOLEAN DEFAULT 0,
                air_conditioning BOOLEAN DEFAULT 0,
                rooms_count INTEGER DEFAULT 1,
                status TEXT CHECK(status IN ('vip', 'standard', 'economy')) DEFAULT 'standard',
                description TEXT,
                price_per_night DECIMAL(10,2) NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        const roomImagesTable = `
            CREATE TABLE room_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                room_id INTEGER NOT NULL,
                image_url TEXT NOT NULL,
                is_main BOOLEAN DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE
            )
        `;

        const clientsTable = `
            CREATE TABLE clients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                surname TEXT NOT NULL,
                name TEXT NOT NULL,
                patronymic TEXT,
                phone TEXT NOT NULL,
                email TEXT,
                checkin_date DATE NOT NULL,
                checkout_date DATE NOT NULL,
                room_id INTEGER NOT NULL,
                current_room_id INTEGER,
                checkout_room_id INTEGER,
                comments TEXT,
                status TEXT CHECK(status IN ('сова', 'жаворонок', 'динозавр', 'бетмен')),
                country TEXT,
                region TEXT,
                FOREIGN KEY (room_id) REFERENCES rooms (id)
            )
        `;

        const bookingsTable = `
            CREATE TABLE bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                client_surname TEXT NOT NULL,
                client_name TEXT NOT NULL,
                client_patronymic TEXT,
                client_phone TEXT NOT NULL,
                client_email TEXT,
                checkin_date DATE NOT NULL,
                checkout_date DATE NOT NULL,
                room_id INTEGER NOT NULL,
                status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
                rejection_reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (room_id) REFERENCES rooms (id)
            )
        `;

        await runQuery(usersTable);
        await runQuery(roomsTable);
        await runQuery(roomImagesTable);
        await runQuery(clientsTable);
        await runQuery(bookingsTable);

        // Создаем тестового администратора
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await runQuery(
            `INSERT INTO users (surname, name, patronymic, login, password, position) VALUES (?, ?, ?, ?, ?, ?)`,
            ['Иванов', 'Иван', 'Иванович', 'admin', hashedPassword, 'Администратор']
        );

        // Создаем тестовые номера с красивыми изображениями
        const sampleRooms = [
            {
                building: 'A', room_number: '101', double_beds: 1, single_beds: 0, 
                kettle: 1, tv: 1, balcony: 1, air_conditioning: 1, rooms_count: 1, 
                status: 'standard', 
                description: 'Уютный стандартный номер с балконом и видом на сад. Просторная кровать, современный дизайн и все необходимые удобства для комфортного проживания.', 
                price_per_night: 3500,
                images: [
                    { url: 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?w=500&h=300&fit=crop', main: true },
                    { url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=500&h=300&fit=crop', main: false }
                ]
            },
            {
                building: 'A', room_number: '102', double_beds: 2, single_beds: 0, 
                kettle: 1, tv: 1, balcony: 0, air_conditioning: 1, rooms_count: 1, 
                status: 'economy', 
                description: 'Экономный номер для бюджетных путешественников. Уютное и функциональное пространство со всем необходимым для комфортного отдыха.', 
                price_per_night: 2200,
                images: [
                    { url: 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?w=500&h=300&fit=crop', main: true }
                ]
            },
            {
                building: 'B', room_number: '201', double_beds: 1, single_beds: 1, 
                kettle: 1, tv: 1, balcony: 1, air_conditioning: 1, rooms_count: 2, 
                status: 'vip', 
                description: 'Просторный VIP номер с гостиной и спальней. Роскошный интерьер, панорамный вид, персональный сервис и эксклюзивные удобства.', 
                price_per_night: 7500,
                images: [
                    { url: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=500&h=300&fit=crop', main: true },
                    { url: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=500&h=300&fit=crop', main: false }
                ]
            },
            {
                building: 'B', room_number: '202', double_beds: 0, single_beds: 2, 
                kettle: 1, tv: 1, balcony: 0, air_conditioning: 1, rooms_count: 1, 
                status: 'standard', 
                description: 'Комфортабельный номер с двумя односпальными кроватями. Идеально подходит для деловой поездки или отдыха друзей.', 
                price_per_night: 2800,
                images: [
                    { url: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=500&h=300&fit=crop', main: true }
                ]
            }
        ];

        for (const room of sampleRooms) {
            const result = await runQuery(
                `INSERT INTO rooms (building, room_number, double_beds, single_beds, kettle, tv, balcony, air_conditioning, rooms_count, status, description, price_per_night) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    room.building, room.room_number, room.double_beds, room.single_beds, 
                    room.kettle, room.tv, room.balcony, room.air_conditioning, room.rooms_count, 
                    room.status, room.description, room.price_per_night
                ]
            );

            const roomId = result.lastID;
            
            // Добавляем изображения
            for (const image of room.images) {
                await runQuery(
                    `INSERT INTO room_images (room_id, image_url, is_main) VALUES (?, ?, ?)`,
                    [roomId, image.url, image.main ? 1 : 0]
                );
            }
        }

        // Создаем тестовые заявки
        await runQuery(
            `INSERT INTO bookings (client_surname, client_name, client_patronymic, client_phone, client_email, checkin_date, checkout_date, room_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ['Петров', 'Петр', 'Петрович', '+7 (123) 456-78-90', 'petrov@mail.ru', '2024-01-15', '2024-01-20', 1]
        );

        await runQuery(
            `INSERT INTO bookings (client_surname, client_name, client_patronymic, client_phone, client_email, checkin_date, checkout_date, room_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ['Сидорова', 'Анна', 'Ивановна', '+7 (987) 654-32-10', 'sidorova@gmail.com', '2024-01-18', '2024-01-22', 3]
        );

        console.log('Database initialized successfully with test data');
    } catch (error) {
        console.error('Database initialization error:', error);
        throw error;
    }
}

// Статические файлы
app.use('/uploads', express.static(uploadsDir));
app.use('/images', express.static(imagesDir));

// Маршруты страниц
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/root', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'root.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// API эндпоинты

// Информация о гостинице
app.get('/api/hotel-info', (req, res) => {
    res.json({
        name: hotelName,
        address: hotelAddress,
        phone: hotelPhone
    });
});

// Инициализация БД
app.post('/api/init-db', requireAuthApi, async (req, res) => {
    try {
        await initDatabase();
        res.json({ success: true, message: 'База данных инициализирована' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Доступные номера - возвращаем HTML
app.get('/api/rooms/available', async (req, res) => {
    const { checkin, checkout } = req.query;
    
    if (!checkin || !checkout) {
        return res.status(400).json({ error: 'Необходимо указать даты заезда и выезда' });
    }

    try {
        const availableRooms = await selectQuery(`
            SELECT r.*, 
                   COALESCE(
                       (SELECT image_url FROM room_images WHERE room_id = r.id AND is_main = 1 LIMIT 1),
                       '/images/room-placeholder.jpg'
                   ) as main_image,
                   (SELECT COUNT(*) FROM room_images WHERE room_id = r.id) as images_count
            FROM rooms r
            WHERE r.id NOT IN (
                SELECT DISTINCT room_id FROM clients 
                WHERE checkin_date < ? AND checkout_date > ?
                UNION
                SELECT DISTINCT room_id FROM bookings 
                WHERE status = 'approved' AND checkin_date < ? AND checkout_date > ?
            )
        `, [checkout, checkin, checkout, checkin]);

        if (availableRooms.length === 0) {
            return res.send(`
                <div class="col-12 text-center py-5">
                    <div class="no-rooms-placeholder">
                        <i class="fas fa-bed fa-4x text-muted mb-4"></i>
                        <h4 class="text-muted mb-3">Нет доступных номеров</h4>
                        <p class="text-muted mb-4">На выбранные даты все номера заняты. Попробуйте выбрать другие даты.</p>
                        <button class="btn btn-outline-primary" onclick="document.querySelector('input[name=\\'checkin\\']').focus()">
                            <i class="fas fa-calendar-alt me-2"></i>Выбрать другие даты
                        </button>
                    </div>
                </div>
            `);
        }

        const roomsHtml = availableRooms.map(room => renderRoomCard(room)).join('');
        res.send(`<div class="row rooms-grid">${roomsHtml}</div>`);
    } catch (error) {
        console.error('Error fetching available rooms:', error);
        res.status(500).send(`
            <div class="col-12 text-center py-5">
                <div class="error-placeholder">
                    <i class="fas fa-exclamation-triangle fa-4x text-danger mb-4"></i>
                    <h4 class="text-danger mb-3">Ошибка при загрузке номеров</h4>
                    <p class="text-muted">Попробуйте обновить страницу или повторить попытку позже.</p>
                </div>
            </div>
        `);
    }
});

// Получить все изображения номера
app.get('/api/rooms/:id/images', requireAuthApi, async (req, res) => {
    const { id } = req.params;
    
    try {
        const images = await selectQuery(`
            SELECT * FROM room_images 
            WHERE room_id = ? 
            ORDER BY is_main DESC, created_at DESC
        `, [id]);
        res.json(images);
    } catch (error) {
        console.error('Error fetching room images:', error);
        res.status(500).json({ error: 'Ошибка при получении изображений' });
    }
});

// Получить данные конкретного номера
app.get('/api/root/rooms/:id', requireAuthApi, async (req, res) => {
    const { id } = req.params;
    
    try {
        const rooms = await selectQuery(`
            SELECT r.*, 
                   COALESCE(
                       (SELECT image_url FROM room_images WHERE room_id = r.id AND is_main = 1 LIMIT 1),
                       '/images/room-placeholder.jpg'
                   ) as main_image,
                   (SELECT COUNT(*) FROM room_images WHERE room_id = r.id) as images_count
            FROM rooms r
            WHERE r.id = ?
        `, [id]);

        if (rooms.length === 0) {
            return res.status(404).json({ error: 'Номер не найден' });
        }

        res.json(rooms[0]);
    } catch (error) {
        console.error('Error fetching room:', error);
        res.status(500).json({ error: 'Ошибка при получении данных номера' });
    }
});

// Заявка на бронирование
app.post('/api/booking-request', async (req, res) => {
    const { surname, name, patronymic, phone, email, checkin, checkout, room_id } = req.body;
    
    if (!surname || !name || !phone || !checkin || !checkout || !room_id) {
        return res.status(400).json({ error: 'Все обязательные поля должны быть заполнены' });
    }

    try {
        await runQuery(
            `INSERT INTO bookings (client_surname, client_name, client_patronymic, client_phone, client_email, checkin_date, checkout_date, room_id) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [surname, name, patronymic || '', phone, email || '', checkin, checkout, room_id]
        );
        
        res.json({ success: true, message: 'Заявка успешно отправлена' });
    } catch (error) {
        console.error('Error creating booking request:', error);
        res.status(500).json({ error: 'Не удалось отправить заявку' });
    }
});

// Управление заявками - возвращаем HTML
app.get('/api/admin/bookings', requireAuthApi, async (req, res) => {
    try {
        const bookings = await selectQuery(`
            SELECT b.*, r.building, r.room_number, r.price_per_night,
                   COALESCE(
                       (SELECT image_url FROM room_images WHERE room_id = r.id AND is_main = 1 LIMIT 1),
                       '/images/room-placeholder.jpg'
                   ) as main_image
            FROM bookings b
            JOIN rooms r ON b.room_id = r.id
            WHERE b.status = 'pending'
            ORDER BY b.created_at DESC
        `);
        
        if (bookings.length === 0) {
            return res.send(`
                <div class="no-bookings-placeholder text-center py-5">
                    <i class="fas fa-clipboard-check fa-4x text-success mb-4"></i>
                    <h4 class="text-success mb-3">Все заявки обработаны!</h4>
                    <p class="text-muted">Нет pending заявок на бронирование.</p>
                </div>
            `);
        }

        const bookingsHtml = bookings.map(booking => renderAdminBookingCard(booking)).join('');
        res.send(bookingsHtml);
    } catch (error) {
        console.error('Error fetching bookings:', error);
        res.status(500).send(`
            <div class="alert alert-danger text-center">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Ошибка при загрузке заявок
            </div>
        `);
    }
});

app.post('/api/admin/bookings/:id/approve', requireAuthApi, async (req, res) => {
    const { id } = req.params;
    
    try {
        const booking = await selectQuery('SELECT * FROM bookings WHERE id = ?', [id]);
        if (booking.length === 0) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }

        const bookingData = booking[0];
        const checkinDate = new Date(bookingData.checkin_date);
        const checkoutDate = new Date(bookingData.checkout_date);
        const timeDiff = checkoutDate.getTime() - checkinDate.getTime();
        const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

        for (let i = 0; i < daysDiff; i++) {
            const currentDate = new Date(checkinDate);
            currentDate.setDate(checkinDate.getDate() + i);
            
            await runQuery(
                `INSERT INTO clients (surname, name, patronymic, phone, email, checkin_date, checkout_date, room_id, current_room_id) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    bookingData.client_surname,
                    bookingData.client_name,
                    bookingData.client_patronymic,
                    bookingData.client_phone,
                    bookingData.client_email,
                    currentDate.toISOString().split('T')[0],
                    bookingData.checkout_date,
                    bookingData.room_id,
                    bookingData.room_id
                ]
            );
        }

        await runQuery('UPDATE bookings SET status = ? WHERE id = ?', ['approved', id]);
        
        res.json({ success: true, message: 'Заявка одобрена' });
    } catch (error) {
        console.error('Error approving booking:', error);
        res.status(500).json({ error: 'Ошибка при одобрении заявки' });
    }
});

app.post('/api/admin/bookings/:id/reject', requireAuthApi, async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    
    try {
        await runQuery('UPDATE bookings SET status = ?, rejection_reason = ? WHERE id = ?', ['rejected', reason, id]);
        res.json({ success: true, message: 'Заявка отклонена' });
    } catch (error) {
        console.error('Error rejecting booking:', error);
        res.status(500).json({ error: 'Ошибка при отклонении заявки' });
    }
});

// Статистика
app.get('/api/root/stats', requireAuthApi, async (req, res) => {
    try {
        const userCount = await selectQuery('SELECT COUNT(*) as count FROM users');
        const roomsByBuilding = await selectQuery('SELECT building, COUNT(*) as count FROM rooms GROUP BY building');
        const clientsByCountry = await selectQuery('SELECT country, COUNT(*) as count FROM clients GROUP BY country');
        const clientsByRegion = await selectQuery('SELECT region, COUNT(*) as count FROM clients GROUP BY region');

        const { date } = req.query;
        const targetDate = date || new Date().toISOString().split('T')[0];
        
        const bookedRooms = await selectQuery(
            'SELECT COUNT(DISTINCT room_id) as count FROM clients WHERE checkin_date <= ? AND checkout_date > ?',
            [targetDate, targetDate]
        );
        
        const totalRooms = await selectQuery('SELECT COUNT(*) as count FROM rooms');
        const freeRooms = totalRooms[0].count - bookedRooms[0].count;

        res.json({
            users: userCount[0].count,
            roomsByBuilding,
            clientsByCountry,
            clientsByRegion,
            occupancy: {
                date: targetDate,
                booked: bookedRooms[0].count,
                free: freeRooms,
                total: totalRooms[0].count
            }
        });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({ error: 'Ошибка при получении статистики' });
    }
});

// Управление пользователями
app.get('/api/root/users', requireAuthApi, async (req, res) => {
    try {
        const users = await selectQuery(`
            SELECT id, surname, name, patronymic, login, position, 
                   last_success_login, last_failed_login, password_change_date
            FROM users 
            ORDER BY surname, name
        `);
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Ошибка при получении пользователей' });
    }
});

app.post('/api/root/users', requireAuthApi, async (req, res) => {
    const { surname, name, patronymic, login, password, position } = req.body;
    
    if (!surname || !name || !login || !password || !position) {
        return res.status(400).json({ error: 'Все обязательные поля должны быть заполнены' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await runQuery(
            `INSERT INTO users (surname, name, patronymic, login, password, position) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [surname, name, patronymic || '', login, hashedPassword, position]
        );
        
        res.json({ success: true, message: 'Пользователь успешно создан' });
    } catch (error) {
        console.error('Error creating user:', error);
        if (error.message.includes('UNIQUE')) {
            res.status(400).json({ error: 'Пользователь с таким логином уже существует' });
        } else {
            res.status(500).json({ error: 'Ошибка при создании пользователя' });
        }
    }
});

app.put('/api/root/users/:id', requireAuthApi, async (req, res) => {
    const { id } = req.params;
    const { surname, name, patronymic, login, position, password } = req.body;
    
    try {
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            await runQuery(
                `UPDATE users SET surname = ?, name = ?, patronymic = ?, login = ?, position = ?, password = ?, password_change_date = CURRENT_TIMESTAMP 
                 WHERE id = ?`,
                [surname, name, patronymic || '', login, position, hashedPassword, id]
            );
        } else {
            await runQuery(
                `UPDATE users SET surname = ?, name = ?, patronymic = ?, login = ?, position = ? 
                 WHERE id = ?`,
                [surname, name, patronymic || '', login, position, id]
            );
        }
        
        res.json({ success: true, message: 'Пользователь успешно обновлен' });
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Ошибка при обновлении пользователя' });
    }
});

app.delete('/api/root/users/:id', requireAuthApi, async (req, res) => {
    const { id } = req.params;
    
    try {
        if (req.session.user.id == id) {
            return res.status(400).json({ error: 'Нельзя удалить собственный аккаунт' });
        }
        
        await runQuery('DELETE FROM users WHERE id = ?', [id]);
        res.json({ success: true, message: 'Пользователь успешно удален' });
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: 'Ошибка при удалении пользователя' });
    }
});

// Управление номерами - возвращаем HTML
app.get('/api/root/rooms', requireAuthApi, async (req, res) => {
    try {
        const rooms = await selectQuery(`
            SELECT r.*, 
                   COALESCE(
                       (SELECT image_url FROM room_images WHERE room_id = r.id AND is_main = 1 LIMIT 1),
                       '/images/room-placeholder.jpg'
                   ) as main_image,
                   (SELECT COUNT(*) FROM room_images WHERE room_id = r.id) as images_count
            FROM rooms r
            ORDER BY r.building, r.room_number
        `);

        if (rooms.length === 0) {
            return res.send(`
                <div class="no-rooms-management text-center py-5">
                    <i class="fas fa-bed fa-4x text-info mb-4"></i>
                    <h4 class="text-info mb-3">Нет добавленных номеров</h4>
                    <p class="text-muted mb-4">Начните с добавления первого номера в вашу гостиницу.</p>
                    <button class="btn btn-primary" onclick="showRoomModal()">
                        <i class="fas fa-plus me-2"></i>Добавить первый номер
                    </button>
                </div>
            `);
        }

        const roomsHtml = rooms.map(room => renderRoomManagementRow(room)).join('');
        res.send(`
            <div class="table-container">
                <div class="table-responsive">
                    <table class="table table-hover rooms-management-table">
                        <thead class="table-header">
                            <tr>
                                <th width="100">Изображение</th>
                                <th width="80">Корпус</th>
                                <th width="100">Номер</th>
                                <th width="120">Статус</th>
                                <th width="120">Цена/сутки</th>
                                <th width="150">Удобства</th>
                                <th width="120">Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${roomsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `);
    } catch (error) {
        console.error('Error fetching rooms:', error);
        res.status(500).send(`
            <div class="alert alert-danger text-center">
                <i class="fas fa-exclamation-triangle me-2"></i>
                Ошибка при загрузке номеров
            </div>
        `);
    }
});

app.post('/api/root/rooms', requireAuthApi, async (req, res) => {
    const { building, room_number, double_beds, single_beds, kettle, tv, balcony, 
            air_conditioning, rooms_count, status, description, price_per_night, image_url } = req.body;
    
    if (!building || !room_number || !price_per_night) {
        return res.status(400).json({ error: 'Все обязательные поля должны быть заполнены' });
    }

    try {
        const result = await runQuery(
            `INSERT INTO rooms (building, room_number, double_beds, single_beds, kettle, tv, balcony, air_conditioning, rooms_count, status, description, price_per_night) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                building, room_number, double_beds || 0, single_beds || 0, 
                kettle ? 1 : 0, tv ? 1 : 0, balcony ? 1 : 0, air_conditioning ? 1 : 0, 
                rooms_count || 1, status || 'standard', description || '', price_per_night
            ]
        );

        const roomId = result.lastID;

        // Добавляем изображение если указано
        if (image_url) {
            await runQuery(
                `INSERT INTO room_images (room_id, image_url, is_main) VALUES (?, ?, ?)`,
                [roomId, image_url, 1]
            );
        } else {
            // Добавляем изображение-заглушку
            await runQuery(
                `INSERT INTO room_images (room_id, image_url, is_main) VALUES (?, ?, ?)`,
                [roomId, '/images/room-placeholder.jpg', 1]
            );
        }
        
        res.json({ success: true, message: 'Номер успешно создан', roomId });
    } catch (error) {
        console.error('Error creating room:', error);
        res.status(500).json({ error: 'Ошибка при создании номера' });
    }
});

app.put('/api/root/rooms/:id', requireAuthApi, async (req, res) => {
    const { id } = req.params;
    const { building, room_number, double_beds, single_beds, kettle, tv, balcony, 
            air_conditioning, rooms_count, status, description, price_per_night } = req.body;
    
    if (!building || !room_number || !price_per_night) {
        return res.status(400).json({ error: 'Все обязательные поля должны быть заполнены' });
    }

    try {
        await runQuery(
            `UPDATE rooms SET building = ?, room_number = ?, double_beds = ?, single_beds = ?, 
             kettle = ?, tv = ?, balcony = ?, air_conditioning = ?, rooms_count = ?, 
             status = ?, description = ?, price_per_night = ?, updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [
                building, room_number, double_beds || 0, single_beds || 0, 
                kettle ? 1 : 0, tv ? 1 : 0, balcony ? 1 : 0, air_conditioning ? 1 : 0, 
                rooms_count || 1, status || 'standard', description || '', price_per_night, id
            ]
        );
        
        res.json({ success: true, message: 'Номер успешно обновлен' });
    } catch (error) {
        console.error('Error updating room:', error);
        res.status(500).json({ error: 'Ошибка при обновлении номера' });
    }
});

app.delete('/api/root/rooms/:id', requireAuthApi, async (req, res) => {
    const { id } = req.params;
    
    try {
        await runQuery('DELETE FROM rooms WHERE id = ?', [id]);
        res.json({ success: true, message: 'Номер успешно удален' });
    } catch (error) {
        console.error('Error deleting room:', error);
        res.status(500).json({ error: 'Ошибка при удалении номера' });
    }
});

// Управление изображениями номеров
app.post('/api/root/rooms/:id/images', requireAuthApi, async (req, res) => {
    const { id } = req.params;
    const { imageUrl, isMain } = req.body;
    
    try {
        // Если устанавливаем как главное, сбрасываем предыдущее главное
        if (isMain) {
            await runQuery('UPDATE room_images SET is_main = 0 WHERE room_id = ?', [id]);
        }
        
        await runQuery(
            'INSERT INTO room_images (room_id, image_url, is_main) VALUES (?, ?, ?)',
            [id, imageUrl, isMain ? 1 : 0]
        );
        
        res.json({ success: true, message: 'Изображение добавлено' });
    } catch (error) {
        console.error('Error adding room image:', error);
        res.status(500).json({ error: 'Ошибка при добавлении изображения' });
    }
});

app.delete('/api/root/rooms/:roomId/images/:imageId', requireAuthApi, async (req, res) => {
    const { roomId, imageId } = req.params;
    
    try {
        const image = await selectQuery('SELECT * FROM room_images WHERE id = ? AND room_id = ?', [imageId, roomId]);
        if (image.length === 0) {
            return res.status(404).json({ error: 'Изображение не найдено' });
        }

        await runQuery('DELETE FROM room_images WHERE id = ?', [imageId]);
        
        // Если удалили главное изображение, назначаем новое главное
        if (image[0].is_main) {
            const remainingImages = await selectQuery('SELECT * FROM room_images WHERE room_id = ? LIMIT 1', [roomId]);
            if (remainingImages.length > 0) {
                await runQuery('UPDATE room_images SET is_main = 1 WHERE id = ?', [remainingImages[0].id]);
            }
        }
        
        res.json({ success: true, message: 'Изображение удалено' });
    } catch (error) {
        console.error('Error deleting room image:', error);
        res.status(500).json({ error: 'Ошибка при удалении изображения' });
    }
});

app.post('/api/root/rooms/:roomId/images/:imageId/set-main', requireAuthApi, async (req, res) => {
    const { roomId, imageId } = req.params;
    
    try {
        // Сбрасываем все главные изображения для этой комнаты
        await runQuery('UPDATE room_images SET is_main = 0 WHERE room_id = ?', [roomId]);
        // Устанавливаем новое главное изображение
        await runQuery('UPDATE room_images SET is_main = 1 WHERE id = ? AND room_id = ?', [imageId, roomId]);
        
        res.json({ success: true, message: 'Главное изображение установлено' });
    } catch (error) {
        console.error('Error setting main image:', error);
        res.status(500).json({ error: 'Ошибка при установке главного изображения' });
    }
});

// Загрузка изображений
app.post('/api/upload', requireAuthApi, async (req, res) => {
    try {
        const { image, filename } = req.body;
        if (!image) {
            return res.status(400).json({ error: 'Нет данных изображения' });
        }

        // Обработка base64
        const matches = image.match(/^data:image\/([A-Za-z-+/]+);base64,(.+)$/);
        if (!matches || matches.length !== 3) {
            return res.status(400).json({ error: 'Неверный формат изображения' });
        }

        const extension = matches[1] === 'jpeg' ? 'jpg' : matches[1];
        const imageFilename = filename || `room_${Date.now()}.${extension}`;
        const filepath = path.join(uploadsDir, imageFilename);

        // Сохраняем файл
        fs.writeFileSync(filepath, matches[2], 'base64');

        res.json({ 
            success: true, 
            url: `/uploads/${imageFilename}`,
            message: 'Изображение успешно загружено'
        });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({ error: 'Ошибка при загрузке изображения' });
    }
});

// Аутентификация
app.post('/api/login', async (req, res) => {
    const { login, password } = req.body;
    
    try {
        const users = await selectQuery('SELECT * FROM users WHERE login = ?', [login]);
        if (users.length === 0) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        const user = users[0];
        const passwordMatch = await bcrypt.compare(password, user.password);
        
        if (passwordMatch) {
            req.session.user = {
                id: user.id,
                name: user.name,
                surname: user.surname,
                position: user.position,
                login: user.login
            };
            await runQuery('UPDATE users SET last_success_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
            res.json({ 
                success: true, 
                user: req.session.user
            });
        } else {
            await runQuery('UPDATE users SET last_failed_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
            res.status(401).json({ error: 'Неверный логин или пароль' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Внутренняя ошибка сервера' });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

app.post('/api/change-password', requireAuthApi, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const userId = req.session.user.id;
    
    try {
        const users = await selectQuery('SELECT * FROM users WHERE id = ?', [userId]);
        if (users.length === 0) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        const user = users[0];
        const passwordMatch = await bcrypt.compare(currentPassword, user.password);
        
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Текущий пароль неверен' });
        }
        
        const hashedNewPassword = await bcrypt.hash(newPassword, 10);
        await runQuery(
            'UPDATE users SET password = ?, password_change_date = CURRENT_TIMESTAMP WHERE id = ?',
            [hashedNewPassword, userId]
        );
        
        res.json({ success: true, message: 'Пароль успешно изменен' });
    } catch (error) {
        console.error('Password change error:', error);
        res.status(500).json({ error: 'Ошибка при смене пароля' });
    }
});

// Обработка graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nClosing database connections...');
    if (dbType === 'postgresql') {
        await db.end();
    } else {
        db.close((err) => {
            if (err) {
                console.error('Error closing SQLite database:', err);
            } else {
                console.log('SQLite database connection closed.');
            }
        });
    }
    process.exit(0);
});

// Запуск сервера
app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Hotel: ${hotelName}`);
    console.log(`Address: ${hotelAddress}`);
    console.log(`Phone: ${hotelPhone}`);
    
    try {
        // Проверяем, есть ли уже данные в базе
        const users = await selectQuery('SELECT COUNT(*) as count FROM users');
        if (users[0].count === 0) {
            console.log('No data found, initializing database...');
            await initDatabase();
        } else {
            console.log('Database already contains data, skipping initialization');
        }
    } catch (error) {
        console.log('First run, initializing database...');
        await initDatabase();
    }
});