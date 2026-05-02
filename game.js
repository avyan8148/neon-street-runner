alert("JS START");

const canvas = document.querySelector("canvas");

if (!canvas) {
  alert("Canvas NOT found ❌");
} else {
  alert("Canvas found ✅");

  const ctx = canvas.getContext("2d");

  canvas.width = 800;
  canvas.height = 400;

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "white";
  ctx.font = "30px Arial";
  ctx.fillText("NOW IT WORKS 🎮", 200, 200);
}
