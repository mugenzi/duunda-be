<!-- @format -->

# Duunda Music App - Backend

A Node.js REST API server for a music streaming application built with Express.js and PostgreSQL.

## Features

- **User Authentication**: Register, login, and JWT-based authentication
- **Music Management**: Upload, view, update, and delete songs
- **Playlist Management**: Create, manage, and organize playlists
- **File Upload**: Support for audio file uploads (MP3, WAV, FLAC, M4A, AAC)
- **Search & Filter**: Search songs by title, artist, album, or genre
- **User Profiles**: Manage user profiles and view statistics

## Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Authentication**: JWT (JSON Web Tokens)
- **Password Hashing**: bcryptjs
- **File Upload**: Multer
- **Security**: Helmet, CORS
- **Logging**: Morgan

## Installation

1. **Clone and install dependencies**:

   ```bash
   cd duunda-be
   yarn install
   ```

2. **Set up PostgreSQL database**:

   - Install PostgreSQL on your system
   - Create a database named `music_app`
   - Run the SQL schema from `config/database.sql`

3. **Configure environment variables**:

   - Copy `.env` file and update with your database credentials
   - Update `JWT_SECRET` with a secure secret key

4. **Create uploads directory**:
   ```bash
   mkdir uploads
   ```

## Usage

### Development

```bash
yarn dev
```

### Production

```bash
yarn start
```

The server will start on `http://localhost:3000`

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/verify` - Verify JWT token

### Music

- `GET /api/music` - Get all songs (with pagination and filters)
- `GET /api/music/:id` - Get single song
- `POST /api/music/upload` - Upload new song (requires auth)
- `PUT /api/music/:id` - Update song (requires auth)
- `DELETE /api/music/:id` - Delete song (requires auth)

### Playlists

- `GET /api/playlists` - Get user's playlists (requires auth)
- `GET /api/playlists/:id` - Get playlist with songs (requires auth)
- `POST /api/playlists` - Create new playlist (requires auth)
- `PUT /api/playlists/:id` - Update playlist (requires auth)
- `DELETE /api/playlists/:id` - Delete playlist (requires auth)
- `POST /api/playlists/:id/songs` - Add song to playlist (requires auth)
- `DELETE /api/playlists/:id/songs/:songId` - Remove song from playlist (requires auth)

### Users

- `GET /api/users/profile` - Get user profile (requires auth)
- `PUT /api/users/profile` - Update user profile (requires auth)
- `GET /api/users/songs` - Get user's uploaded songs (requires auth)

### Health Check

- `GET /health` - Server and database health check

## Environment Variables

```env
PORT=3000
NODE_ENV=development

DB_HOST=localhost
DB_PORT=5432
DB_NAME=music_app
DB_USER=postgres
DB_PASSWORD=password

JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d

MAX_FILE_SIZE=50000000
UPLOAD_PATH=./uploads

CORS_ORIGIN=http://localhost:3000
```

## Database Schema

The application uses the following main tables:

- `users` - User accounts and authentication
- `songs` - Music tracks and metadata
- `playlists` - User-created playlists
- `playlist_songs` - Junction table for playlist-song relationships

## Security Features

- JWT-based authentication
- Password hashing with bcryptjs
- Security headers with Helmet
- CORS configuration
- File upload validation
- SQL injection protection with parameterized queries

## File Upload

Supports audio file uploads with the following formats:

- MP3
- WAV
- FLAC
- M4A
- AAC

Maximum file size: 50MB (configurable)

## Development

The project structure:

```
duunda-be/
├── config/          # Database schema and configuration
├── routes/          # API route handlers
├── uploads/         # Uploaded audio files
├── .env            # Environment variables
├── index.js        # Main server file
└── package.json    # Dependencies and scripts
```

## License

ISC
