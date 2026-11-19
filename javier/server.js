const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const PAQUETES_FILE = path.join(DATA_DIR, 'paquetes.json');
const RESERVAS_FILE = path.join(DATA_DIR, 'reservas.json');

const CATEGORIAS = ['Playa', 'Montaña', 'Ciudad', 'Aventura', 'Crucero', 'Cultural'];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

function leer(archivo) {
  try {
    return JSON.parse(fs.readFileSync(archivo, 'utf-8'));
  } catch {
    return [];
  }
}

function guardar(archivo, datos) {
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(archivo, JSON.stringify(datos, null, 2));
}

function enviarJSON(res, status, data) {
  res.writeHead(status, { 'Content-Type': MIME['.json'] });
  res.end(data === undefined ? '' : JSON.stringify(data));
}

function leerBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        reject(new Error('Body demasiado grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('JSON inválido'));
      }
    });
    req.on('error', reject);
  });
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function textoObligatorio(datos, campo, nombre, errores, limpio, parcial) {
  if (datos[campo] !== undefined || !parcial) {
    if (typeof datos[campo] !== 'string' || !datos[campo].trim()) errores.push(`${nombre} es obligatorio`);
    else limpio[campo] = datos[campo].trim();
  }
}

function validarPaquete(datos, actual = null) {
  const parcial = actual !== null;
  const errores = [];
  const limpio = {};

  textoObligatorio(datos, 'destino', 'El destino', errores, limpio, parcial);
  textoObligatorio(datos, 'pais', 'El país', errores, limpio, parcial);

  if (datos.categoria !== undefined || !parcial) {
    if (!CATEGORIAS.includes(datos.categoria)) errores.push('Categoría inválida');
    else limpio.categoria = datos.categoria;
  }
  for (const [campo, nombre] of [['fechaSalida', 'salida'], ['fechaRegreso', 'regreso']]) {
    if (datos[campo] !== undefined || !parcial) {
      if (typeof datos[campo] !== 'string' || !FECHA_RE.test(datos[campo]) || isNaN(Date.parse(datos[campo])))
        errores.push(`Fecha de ${nombre} inválida`);
      else limpio[campo] = datos[campo];
    }
  }
  if (datos.precio !== undefined || !parcial) {
    const precio = Number(datos.precio);
    if (datos.precio === '' || datos.precio === null || !Number.isFinite(precio) || precio <= 0)
      errores.push('El precio debe ser mayor a 0');
    else limpio.precio = Math.round(precio * 100) / 100;
  }
  if (datos.cupos !== undefined || !parcial) {
    const cupos = Number(datos.cupos);
    if (datos.cupos === '' || datos.cupos === null || !Number.isInteger(cupos) || cupos < 0)
      errores.push('Los cupos deben ser un entero mayor o igual a 0');
    else limpio.cupos = cupos;
  }
  if (datos.descripcion !== undefined) limpio.descripcion = String(datos.descripcion).trim();

  const salida = limpio.fechaSalida ?? actual?.fechaSalida;
  const regreso = limpio.fechaRegreso ?? actual?.fechaRegreso;
  if (salida && regreso && regreso < salida) errores.push('El regreso no puede ser antes de la salida');

  return { errores, limpio };
}

function validarReserva(datos) {
  const errores = [];
  const limpio = {};

  textoObligatorio(datos, 'cliente', 'El nombre del cliente', errores, limpio, false);
  if (typeof datos.email !== 'string' || !EMAIL_RE.test(datos.email.trim())) errores.push('Email inválido');
  else limpio.email = datos.email.trim().toLowerCase();

  const personas = Number(datos.personas);
  if (!Number.isInteger(personas) || personas < 1) errores.push('Debe reservar al menos 1 persona');
  else limpio.personas = personas;

  if (typeof datos.paqueteId !== 'string' || !datos.paqueteId) errores.push('Paquete obligatorio');
  else limpio.paqueteId = datos.paqueteId;

  return { errores, limpio };
}

async function manejarPaquetes(req, res, url, id) {
  const paquetes = leer(PAQUETES_FILE);

  if (req.method === 'GET' && !id) {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const categoria = url.searchParams.get('categoria');
    const disponible = url.searchParams.get('disponible');
    let resultado = paquetes;
    if (q) {
      resultado = resultado.filter((p) =>
        [p.destino, p.pais, p.descripcion].some((c) => (c || '').toLowerCase().includes(q))
      );
    }
    if (categoria) resultado = resultado.filter((p) => p.categoria === categoria);
    if (disponible === 'true' || disponible === 'false') {
      resultado = resultado.filter((p) => p.cupos > 0 === (disponible === 'true'));
    }
    resultado = [...resultado].sort((a, b) => a.fechaSalida.localeCompare(b.fechaSalida));
    return enviarJSON(res, 200, resultado);
  }

  if (req.method === 'GET' && id) {
    const paquete = paquetes.find((p) => p.id === id);
    return paquete ? enviarJSON(res, 200, paquete) : enviarJSON(res, 404, { error: 'Paquete no encontrado' });
  }

  if (req.method === 'POST' && !id) {
    const datos = await leerBody(req);
    const { errores, limpio } = validarPaquete(datos);
    if (errores.length) return enviarJSON(res, 400, { error: errores.join(', ') });

    const nuevo = {
      id: crypto.randomUUID(),
      descripcion: '',
      ...limpio,
      creado: new Date().toISOString(),
    };
    paquetes.push(nuevo);
    guardar(PAQUETES_FILE, paquetes);
    return enviarJSON(res, 201, nuevo);
  }

  if (req.method === 'PUT' && id) {
    const idx = paquetes.findIndex((p) => p.id === id);
    if (idx === -1) return enviarJSON(res, 404, { error: 'Paquete no encontrado' });

    const datos = await leerBody(req);
    const { errores, limpio } = validarPaquete(datos, paquetes[idx]);
    if (errores.length) return enviarJSON(res, 400, { error: errores.join(', ') });

    paquetes[idx] = { ...paquetes[idx], ...limpio };
    guardar(PAQUETES_FILE, paquetes);
    return enviarJSON(res, 200, paquetes[idx]);
  }

  if (req.method === 'DELETE' && id) {
    const idx = paquetes.findIndex((p) => p.id === id);
    if (idx === -1) return enviarJSON(res, 404, { error: 'Paquete no encontrado' });
    if (leer(RESERVAS_FILE).some((r) => r.paqueteId === id)) {
      return enviarJSON(res, 409, { error: 'El paquete tiene reservas; cancélalas primero' });
    }
    paquetes.splice(idx, 1);
    guardar(PAQUETES_FILE, paquetes);
    res.writeHead(204);
    return res.end();
  }

  return enviarJSON(res, 405, { error: 'Método no permitido' });
}

async function manejarReservas(req, res, url, id) {
  const reservas = leer(RESERVAS_FILE);

  if (req.method === 'GET' && !id) {
    const paqueteId = url.searchParams.get('paqueteId');
    const paquetes = leer(PAQUETES_FILE);
    const resultado = reservas
      .filter((r) => !paqueteId || r.paqueteId === paqueteId)
      .map((r) => {
        const p = paquetes.find((x) => x.id === r.paqueteId);
        return { ...r, paquete: p ? { destino: p.destino, pais: p.pais, fechaSalida: p.fechaSalida } : null };
      })
      .sort((a, b) => b.creado.localeCompare(a.creado));
    return enviarJSON(res, 200, resultado);
  }

  if (req.method === 'GET' && id) {
    const reserva = reservas.find((r) => r.id === id);
    return reserva ? enviarJSON(res, 200, reserva) : enviarJSON(res, 404, { error: 'Reserva no encontrada' });
  }

  if (req.method === 'POST' && !id) {
    const datos = await leerBody(req);
    const { errores, limpio } = validarReserva(datos);
    if (errores.length) return enviarJSON(res, 400, { error: errores.join(', ') });

    const paquetes = leer(PAQUETES_FILE);
    const paquete = paquetes.find((p) => p.id === limpio.paqueteId);
    if (!paquete) return enviarJSON(res, 404, { error: 'Paquete no encontrado' });
    if (paquete.cupos < limpio.personas) {
      return enviarJSON(res, 409, { error: `Solo quedan ${paquete.cupos} cupos disponibles` });
    }

    paquete.cupos -= limpio.personas;
    const nueva = {
      id: crypto.randomUUID(),
      ...limpio,
      total: Math.round(paquete.precio * limpio.personas * 100) / 100,
      creado: new Date().toISOString(),
    };
    reservas.push(nueva);
    guardar(PAQUETES_FILE, paquetes);
    guardar(RESERVAS_FILE, reservas);
    return enviarJSON(res, 201, nueva);
  }

  if (req.method === 'DELETE' && id) {
    const idx = reservas.findIndex((r) => r.id === id);
    if (idx === -1) return enviarJSON(res, 404, { error: 'Reserva no encontrada' });
    const [cancelada] = reservas.splice(idx, 1);

    const paquetes = leer(PAQUETES_FILE);
    const paquete = paquetes.find((p) => p.id === cancelada.paqueteId);
    if (paquete) {
      paquete.cupos += cancelada.personas;
      guardar(PAQUETES_FILE, paquetes);
    }
    guardar(RESERVAS_FILE, reservas);
    res.writeHead(204);
    return res.end();
  }

  return enviarJSON(res, 405, { error: 'Método no permitido' });
}

async function manejarAPI(req, res, url) {
  const partes = url.pathname.split('/').filter(Boolean); // ['api', recurso, ':id?']
  if (partes.length > 3) return enviarJSON(res, 404, { error: 'Ruta no encontrada' });
  const [, recurso, id] = partes;

  if (recurso === 'categorias' && !id && req.method === 'GET') return enviarJSON(res, 200, CATEGORIAS);
  if (recurso === 'paquetes') return manejarPaquetes(req, res, url, id);
  if (recurso === 'reservas') return manejarReservas(req, res, url, id);
  return enviarJSON(res, 404, { error: 'Ruta no encontrada' });
}

function servirEstatico(req, res, url) {
  const ruta = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const archivo = path.normalize(path.join(PUBLIC_DIR, ruta));

  if (!archivo.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Prohibido');
  }

  fs.readFile(archivo, (err, contenido) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 - No encontrado');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(archivo)] || 'application/octet-stream' });
    res.end(contenido);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  console.log(`${new Date().toLocaleTimeString()} ${req.method} ${url.pathname}`);

  try {
    if (url.pathname.startsWith('/api/')) return await manejarAPI(req, res, url);
    if (req.method === 'GET') return servirEstatico(req, res, url);
    enviarJSON(res, 405, { error: 'Método no permitido' });
  } catch (err) {
    enviarJSON(res, 400, { error: err.message || 'Error en la petición' });
  }
});

server.listen(PORT, () => {
  console.log(`✈️  Servidor corriendo en http://localhost:${PORT}`);
});
