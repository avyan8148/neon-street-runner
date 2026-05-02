const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");

canvas.width = 800;
canvas.height = 400;

ctx.fillStyle = "black";
ctx.fillRect(0, 0, canvas.width, canvas.height);

ctx.fillStyle = "white";
ctx.font = "30px Arial";
ctx.fillText("GAME IS WORKING 🎮", 200, 200);
