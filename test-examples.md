# Duunda Music App - API Testing Examples

## 🔐 Authentication Flow

### 1. Register User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 2. Login User
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

**Response will include JWT token:**
```json
{
  "message": "Login successful",
  "user": {
    "id": 1,
    "username": "testuser",
    "email": "test@example.com"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

## 🎵 Music Upload API

### Upload Song (with audio file)
```bash
# Replace YOUR_JWT_TOKEN with the token from login response
curl -X POST http://localhost:3000/api/music/upload \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "audio=@/path/to/your/song.mp3" \
  -F "title=Sample Song" \
  -F "artist=Test Artist" \
  -F "album=Test Album" \
  -F "genre=Pop" \
  -F "duration=180"
```

### Sample Form Data for Upload:
- **audio**: (file) - Your MP3/WAV/FLAC/M4A/AAC file
- **title**: "Bohemian Rhapsody"
- **artist**: "Queen"
- **album**: "A Night at the Opera"
- **genre**: "Rock"
- **duration**: 355 (in seconds)

## 📋 Postman Collection Example

### Upload Song Request:
- **Method**: POST
- **URL**: `http://localhost:3000/api/music/upload`
- **Headers**: 
  - `Authorization: Bearer YOUR_JWT_TOKEN`
- **Body** (form-data):
  | Key | Value | Type |
  |-----|-------|------|
  | audio | [Select File] | File |
  | title | "Shape of You" | Text |
  | artist | "Ed Sheeran" | Text |
  | album | "÷ (Divide)" | Text |
  | genre | "Pop" | Text |
  | duration | 233 | Text |

## 🧪 JavaScript/Fetch Example

```javascript
// First, login to get token
const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'test@example.com',
    password: 'password123'
  })
});

const { token } = await loginResponse.json();

// Then upload song
const formData = new FormData();
formData.append('audio', audioFile); // File input element
formData.append('title', 'Test Song');
formData.append('artist', 'Test Artist');
formData.append('album', 'Test Album');
formData.append('genre', 'Electronic');
formData.append('duration', '240');

const uploadResponse = await fetch('http://localhost:3000/api/music/upload', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`
  },
  body: formData
});

const result = await uploadResponse.json();
console.log(result);
```

## 📱 React/Frontend Example

```jsx
import React, { useState } from 'react';

function MusicUpload() {
  const [file, setFile] = useState(null);
  const [metadata, setMetadata] = useState({
    title: '',
    artist: '',
    album: '',
    genre: '',
    duration: ''
  });

  const handleUpload = async () => {
    const formData = new FormData();
    formData.append('audio', file);
    formData.append('title', metadata.title);
    formData.append('artist', metadata.artist);
    formData.append('album', metadata.album);
    formData.append('genre', metadata.genre);
    formData.append('duration', metadata.duration);

    try {
      const response = await fetch('http://localhost:3000/api/music/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      const result = await response.json();
      console.log('Upload successful:', result);
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  return (
    <div>
      <input 
        type="file" 
        accept="audio/*" 
        onChange={(e) => setFile(e.target.files[0])} 
      />
      <input 
        placeholder="Title" 
        value={metadata.title}
        onChange={(e) => setMetadata({...metadata, title: e.target.value})}
      />
      <input 
        placeholder="Artist" 
        value={metadata.artist}
        onChange={(e) => setMetadata({...metadata, artist: e.target.value})}
      />
      <button onClick={handleUpload}>Upload Song</button>
    </div>
  );
}
```

## 🎧 Sample Test Data

### Song Metadata Examples:
```json
{
  "title": "Blinding Lights",
  "artist": "The Weeknd",
  "album": "After Hours",
  "genre": "Synthpop",
  "duration": 200
}

{
  "title": "Watermelon Sugar",
  "artist": "Harry Styles", 
  "album": "Fine Line",
  "genre": "Pop Rock",
  "duration": 174
}

{
  "title": "Levitating",
  "artist": "Dua Lipa",
  "album": "Future Nostalgia", 
  "genre": "Dance Pop",
  "duration": 203
}
```

## 🔍 Testing Other Endpoints

### Get All Songs:
```bash
curl -X GET http://localhost:3000/api/music
```

### Get Single Song:
```bash
curl -X GET http://localhost:3000/api/music/1
```

### Download/Stream Song:
```bash
curl -X GET http://localhost:3000/api/music/1/download \
  --output downloaded_song.mp3
```

### Create Playlist:
```bash
curl -X POST http://localhost:3000/api/playlists \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Favorites",
    "description": "Collection of my favorite songs"
  }'
```

## 📝 Notes

1. **File Size Limit**: 50MB (configurable in .env)
2. **Supported Formats**: MP3, WAV, FLAC, M4A, AAC
3. **Authentication**: Required for upload, update, delete operations
4. **Storage**: Files are stored as binary data in PostgreSQL database
5. **Streaming**: Use `/download` endpoint to stream audio files

## 🚀 Quick Start Test

1. Start your server: `yarn dev`
2. Register a user using the register endpoint
3. Login to get JWT token
4. Use the token to upload a song with the upload endpoint
5. Test streaming with the download endpoint
