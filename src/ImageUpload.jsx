import { useEffect, useRef, useState } from "react";
import { Hands } from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import "./ImageUpload.css";

const ImageUpload = () => {
  const [idleSeconds, setIdleSeconds] = useState(0);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cropRef = useRef({ x: 10, y: 10 }); 
  const [predictedText, setPredictedText] = useState("");
  const [isPredicting, setIsPredicting] = useState(false);
  const lastPrediction = useRef("");
  const handPresent = useRef(false);
  const lastHandDetectedTime = useRef(Date.now());
  const spaceAdded = useRef(false); 

  const url = "https://uvicorn-server.onrender.com"
  // const url = "http://127.0.0.1:8000"

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

  useEffect(() => {
    const interval = setInterval(sendImage, 2000);
    return () => clearInterval(interval);
  }, [isPredicting]);

  const sendImage = async () => {
    if (!isPredicting) return;
    const now = Date.now();
    if (
      !handPresent.current &&
      now - lastHandDetectedTime.current > 3000 &&
      !spaceAdded.current
    ) {
      setPredictedText((prev) => prev + " ");
      spaceAdded.current = true;
    }

    if (!handPresent.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const { x, y } = cropRef.current;
    const width = 200;
    const height = 200;

    const croppedImage = ctx.getImageData(x, y, width, height);

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.putImageData(croppedImage, 0, 0);

    const base64Img = tempCanvas.toDataURL("image/jpeg");

    try {
      const formData = new FormData();
      const blob = await (await fetch(base64Img)).blob();
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
  useEffect(() => {
    const idleTimer = setInterval(() => {
      if (!handPresent.current) {
        const secondsPassed = Math.floor(
          (Date.now() - lastHandDetectedTime.current) / 1000
        );
        setIdleSeconds(secondsPassed);

        if (secondsPassed >= 3 && !spaceAdded.current) {
          setPredictedText((prev) => prev + " ");
          spaceAdded.current = true;
        }
      } else {
        setIdleSeconds(0);
      }
    }, 1000);

    return () => clearInterval(idleTimer);
  }, []);

  const handleToggle = () => {
    setIsPredicting((prev) => !prev);
  };

  const handleClear = () => {
    setPredictedText("");
    lastPrediction.current = "";
    spaceAdded.current = false;
  };

  return (
    <div className="upload-container">
      <div className="top-left-controls">
        <button onClick={handleToggle} className="send-button">
          {isPredicting ? "Stop" : "Start"}
        </button>
        <button onClick={handleClear} className="send-button clear">
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
        <h3>Predicted Output:</h3>
        <div className="scrollable-text">{predictedText || "..."}</div>
        <div className="idle-timer">
          {handPresent.current
            ? "Hand detected"
            : idleSeconds < 3
            ? `Waiting... (${3 - idleSeconds}s left to insert space)`
            : "Space inserted"}
        </div>
      </div>
    </div>
  );
};

export default ImageUpload;
