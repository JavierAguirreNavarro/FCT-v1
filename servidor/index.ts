import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

// --- Conexión MySQL ---
const db = await mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT)
});

console.log("✅ Conectado a la base de datos MySQL (XAMPP)");

// --- Endpoint para obtener productos ---
app.get("/productos", async (req, res) => {
  const [productos] = await db.query(`
    SELECT p.id, p.nombre, p.descripcion, p.precio, p.disponible
    FROM productos p
    WHERE p.disponible = true
  `);

  const [alergenos] = await db.query(`
    SELECT pa.producto_id, a.nombre, a.icono
    FROM producto_alergeno pa
    JOIN alergenos a ON a.id = pa.alergeno_id
  `);

  const productosConAlergenos = (productos as any[]).map((p) => ({
    ...p,
    alergenos: (alergenos as any[])
      .filter((a) => a.producto_id === p.id)
      .map((a) => ({ nombre: a.nombre, icono: a.icono }))
  }));

  res.json(productosConAlergenos);
});

// --- Comunicación por Socket.io ---
const pedidos: Record<string, any> = {};

io.on("connection", (socket) => {
  console.log("Cliente conectado:", socket.id);

  socket.on("nuevoPedido", (pedido) => {
    pedidos[socket.id] = { ...pedido, estado: "recibido" };
    socket.emit("estadoPedido", pedidos[socket.id]);
    io.emit("listaPedidos", Object.values(pedidos));
  });

  socket.on("actualizarEstado", ({ id, nuevoEstado }) => {
    if (pedidos[id]) {
      pedidos[id].estado = nuevoEstado;
      io.to(id).emit("estadoPedido", pedidos[id]);
      io.emit("listaPedidos", Object.values(pedidos));
    }
  });

  socket.on("disconnect", () => {
    delete pedidos[socket.id];
    io.emit("listaPedidos", Object.values(pedidos));
  });
});

httpServer.listen(process.env.PORT, () => {
  console.log(` Servidor corriendo en http://localhost:${process.env.PORT}`);
});
