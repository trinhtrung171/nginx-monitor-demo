import fs from 'fs';
import path from 'path';

async function testUpload() {
  const formData = new FormData();
  // Create a dummy text file
  const blob = new Blob(["hello world"], { type: "text/plain" });
  formData.append("file", blob, "test.txt");

  const res = await fetch("http://localhost:3001/upload", {
    method: "POST",
    body: formData
  });
  
  const data = await res.json();
  console.log("Upload response:", data);

  if (data.url) {
    const fetchRes = await fetch(data.url);
    console.log("Fetch response status:", fetchRes.status);
    if (fetchRes.ok) {
      console.log("Fetch text:", await fetchRes.text());
    }
  }
}

testUpload().catch(console.error);
