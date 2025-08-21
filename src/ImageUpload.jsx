import { useEffect, useRef, useState } from "react";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import "./ImageUpload.css";

const ImageUpload = () => {
  const previewRef = useRef(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cropRef = useRef({ x: 10, y: 10 });
  const [predictedText, setPredictedText] = useState("");
  const [isPredicting, setIsPredicting] = useState(false);
  const lastPrediction = useRef("");
  const handPresent = useRef(false);
  const lastHandDetectedTime = useRef(Date.now());
  const spaceAdded = useRef(false);

  const url = "https://uvicorn-server.onrender.com";
  // const url = "http://127.0.0.1:8000";

  // toggle prediction

  const handleToggle = () => {
    setIsPredicting((prev) => !prev);
  };

  // clear predicted text
  const handleClear = () => {
    setPredictedText("");
    lastPrediction.current = "";
    spaceAdded.current = false;
  };

  // setting up

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const hands = new Hands({
      locateFile: (file) =>
        `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
    });

    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 1,
      minDetectionConfidence: 0.8,
      minTrackingConfidence: 0.5,
    });
    hands.onResults((results) => {
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(-1, 1);
      ctx.translate(-canvas.width, 0);
      ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        handPresent.current = true;
        lastHandDetectedTime.current = Date.now();
        spaceAdded.current = false;

        const landmarks = results.multiHandLandmarks[0];
        const xValues = landmarks.map((lm) => (1 - lm.x) * canvas.width);
        const yValues = landmarks.map((lm) => lm.y * canvas.height);

        const xCenter = (Math.min(...xValues) + Math.max(...xValues)) / 2;
        const yCenter = (Math.min(...yValues) + Math.max(...yValues)) / 2;

        const boxSize = 204;
        const xStart = Math.max(0, xCenter - boxSize / 2);
        const yStart = Math.max(0, yCenter - boxSize / 2);

        ctx.beginPath();
        ctx.strokeStyle = "red";
        ctx.lineWidth = 1;
        ctx.rect(xStart, yStart, boxSize, boxSize);
        ctx.stroke();

        cropRef.current = { x: xStart + 2, y: yStart + 2 };
      } else {
        handPresent.current = false;
      }
    });
    const camera = new Camera(video, {
      onFrame: async () => {
        await hands.send({ image: video });
      },
      width: 640,
      height: 480,
    });

    camera.start();
  }, []);

  // send image at 2s interval

  useEffect(() => {
    if (!isPredicting) return;

    const interval = setInterval(sendImage, 2000);
    return () => clearInterval(interval);
  }, [isPredicting]);

  // send image
  const sendImage = async () => {
    if (!isPredicting || !handPresent.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const { x, y } = cropRef.current;
    const width = 200;
    const height = 200;

    const croppedImage = ctx.getImageData(x, y, width, height);

    const previewCanvas = previewRef.current;
    const previewCtx = previewCanvas.getContext("2d");
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.drawImage(
      canvas,
      x,
      y,
      width,
      height,
      0,
      0,
      previewCanvas.width,
      previewCanvas.height
    );

    const offCanvas = new OffscreenCanvas(width, height);
    const offCtx = offCanvas.getContext("2d");
    offCtx.putImageData(croppedImage, 0, 0);

    const blob = await offCanvas.convertToBlob({ type: "image/jpeg" });

    try {
      const formData = new FormData();
      formData.append("image", blob, "hand.jpg");

      const res = await fetch(`${url}/predict/`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      const currentChar = data.filename;

      if (currentChar && currentChar !== lastPrediction.current) {
        setPredictedText((prev) => prev + currentChar);
        lastPrediction.current = currentChar;
      }
    } catch (err) {
      console.error("Prediction error:", err);
    }
  };

  return (
    <div className="upload-container">
      <canvas
        width="100"
        height="100"
        ref={previewRef}
      />

      <div className="controls">
        <button onClick={handleToggle} className="start-button">
          {isPredicting ? "Stop" : "Start"}
        </button>
        <button onClick={handleClear} className="clear-button">
          Clear
        </button>
      </div>

      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        width="640"
        height="480"
        style={{ display: "none" }}
      />

      <canvas
        ref={canvasRef}
        width="640"
        height="480"
        className="output-canvas"
      />

      <div className="output-text-box">
        <h4>Predicted Output:</h4>
        <div className="scrollable-text">{predictedText || "..."}</div>
        <div className="idle-timer">
          {handPresent.current ? "Hand detected" : ""}
        </div>
      </div>
    </div>
  );
};

export default ImageUpload;
