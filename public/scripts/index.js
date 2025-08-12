/** @format */

const form = document.getElementById("uploadForm");
const fileInput = document.getElementById("audioFile");
const fileLabel = document.getElementById("fileLabel");
const coverInput = document.getElementById("coverImage");
const coverLabel = document.getElementById("coverLabel");
const uploadBtn = document.getElementById("uploadBtn");
const progressContainer = document.getElementById("progressContainer");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const message = document.getElementById("message");

// Handle audio file selection
fileInput.addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (file) {
    fileLabel.textContent = `📄 ${file.name}`;
    fileLabel.classList.add("has-file");
  } else {
    fileLabel.textContent =
      "📁 Choose an audio file (MP3, WAV, FLAC, M4A, AAC)";
    fileLabel.classList.remove("has-file");
  }
});

// Handle cover image selection
coverInput.addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (file) {
    coverLabel.textContent = `🖼️ ${file.name}`;
    coverLabel.classList.add("has-file");
  } else {
    coverLabel.textContent =
      "🖼️ Choose a cover image (JPG, PNG, WEBP) - Optional";
    coverLabel.classList.remove("has-file");
  }
});

// Handle form submission
form.addEventListener("submit", async function (e) {
  e.preventDefault();

  const formData = new FormData();
  const accessToken = document.getElementById("accessToken").value;
  const audioFile = document.getElementById("audioFile").files[0];
  const coverImage = document.getElementById("coverImage").files[0];
  const title = document.getElementById("title").value;
  const artist = document.getElementById("artist").value;
  const album = document.getElementById("album").value;
  const genre = document.getElementById("genre").value;
  const duration = document.getElementById("duration").value;

  if (!accessToken || !audioFile || !title || !artist) {
    showMessage("Please fill in all required fields", "error");
    return;
  }

  // Append form data
  formData.append("audio", audioFile);
  if (coverImage) formData.append("cover", coverImage);
  formData.append("title", title);
  formData.append("artist", artist);
  if (album) formData.append("album", album);
  if (genre) formData.append("genre", genre);
  if (duration) formData.append("duration", duration);

  // Show progress
  uploadBtn.disabled = true;
  uploadBtn.textContent = "Uploading...";
  progressContainer.style.display = "block";
  message.style.display = "none";

  try {
    const xhr = new XMLHttpRequest();

    // Track upload progress
    xhr.upload.addEventListener("progress", function (e) {
      if (e.lengthComputable) {
        const percentComplete = (e.loaded / e.total) * 100;
        progressFill.style.width = percentComplete + "%";
        progressText.textContent = `Uploading... ${Math.round(
          percentComplete
        )}%`;
      }
    });

    xhr.onload = function () {
      if (xhr.status === 201) {
        const response = JSON.parse(xhr.responseText);
        showMessage("🎉 Song uploaded successfully!", "success");
        form.reset();
        fileLabel.textContent =
          "📁 Choose an audio file (MP3, WAV, FLAC, M4A, AAC)";
        fileLabel.classList.remove("has-file");
      } else {
        const error = JSON.parse(xhr.responseText);
        showMessage(`❌ Upload failed: ${error.message}`, "error");
      }
    };

    xhr.onerror = function () {
      showMessage("❌ Network error occurred during upload", "error");
    };

    xhr.onloadend = function () {
      uploadBtn.disabled = false;
      uploadBtn.textContent = "🚀 Upload Song";
      progressContainer.style.display = "none";
    };

    xhr.open("POST", "/api/music/upload");
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.send(formData);
  } catch (error) {
    console.error("Upload error:", error);
    showMessage("❌ An error occurred during upload", "error");
    uploadBtn.disabled = false;
    uploadBtn.textContent = "🚀 Upload Song";
    progressContainer.style.display = "none";
  }
});

function showMessage(text, type) {
  message.textContent = text;
  message.className = `message ${type}`;
  message.style.display = "block";

  // Auto-hide success messages after 5 seconds
  if (type === "success") {
    setTimeout(() => {
      message.style.display = "none";
    }, 5000);
  }
}
