const API_PAQUETES = '/api/paquetes';
const API_RESERVAS = '/api/reservas';

const $ = (id) => document.getElementById(id);

const form = $('form-paquete');
const campos = {
  id: $('paquete-id'),
  destino: $('destino'),
  pais: $('pais'),
  categoria: $('categoria'),
  fechaSalida: $('fechaSalida'),
  fechaRegreso: $('fechaRegreso'),
  precio: $('precio'),
  cupos: $('cupos'),
  descripcion: $('descripcion'),
};
const CAMPOS_PAQUETE = ['destino', 'pais', 'categoria', 'fechaSalida', 'fechaRegreso', 'precio', 'cupos', 'descripcion'];
const formTitulo = $('form-titulo');
const btnGuardar = $('btn-guardar');
const btnCancelar = $('btn-cancelar');
const errorForm = $('error-form');
const lista = $('lista');
const vacio = $('vacio');
const conteo = $('conteo');
const listaReservas = $('lista-reservas');
const vacioReservas = $('vacio-reservas');
const buscar = $('buscar');
const filtroCategoria = $('filtro-categoria');
const filtroDisponible = $('filtro-disponible');
const toast = $('toast');

let paquetes = [];
let totalPaquetes = 0;
let resaltarId = null;
let confirmTimer;

async function api(url, opciones = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  });
  if (res.status === 204) return null;
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error en el servidor');
  return data;
}

function escapar(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

const moneda = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const fechaCorta = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const fecha = (iso) => (iso ? fechaCorta.format(new Date(iso)) : '');
const noches = (salida, regreso) => Math.round((Date.parse(regreso) - Date.parse(salida)) / 86400000);
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const icono = (nombre) => `<svg class="icono" aria-hidden="true"><use href="#i-${nombre}"/></svg>`;
const hoy = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function etiquetaCupos(cupos) {
  if (cupos === 0) return '<span class="etiqueta sin-cupo">Agotado</span>';
  if (cupos <= 3) return `<span class="etiqueta pocos">${plural(cupos, 'cupo', 'cupos')} · últimos</span>`;
  return `<span class="etiqueta con-cupo">${plural(cupos, 'cupo', 'cupos')}</span>`;
}

function htmlBotones(p) {
  return `
    <button data-accion="reservar" class="reservar" ${p.cupos === 0 ? 'disabled' : ''}>Reservar</button>
    <button data-accion="editar" class="icono-btn" aria-label="Editar ${escapar(p.destino)}" title="Editar">${icono('edit')}</button>
    <button data-accion="borrar" class="icono-btn peligro" aria-label="Eliminar ${escapar(p.destino)}" title="Eliminar">${icono('trash')}</button>`;
}

function htmlPaquete(p) {
  const n = noches(p.fechaSalida, p.fechaRegreso);
  const clases = ['paquete'];
  if (p.cupos === 0) clases.push('agotado');
  if (campos.id.value === p.id) clases.push('editando');
  return `
    <li class="${clases.join(' ')}" data-id="${p.id}" data-categoria="${escapar(p.categoria)}">
      <div class="paquete-fila${p.id === resaltarId ? ' nuevo' : ''}">
        <div class="info">
          <div class="cabeza">
            <span class="titulo">${escapar(p.destino)}</span>
            <span class="pais">${escapar(p.pais)}</span>
          </div>
          <div class="datos">
            <span>${icono('calendar')}${fecha(p.fechaSalida)} – ${fecha(p.fechaRegreso)}</span>
            <span>${icono('moon')}${plural(n, 'noche', 'noches')}</span>
          </div>
          ${p.descripcion ? `<p class="descripcion">${escapar(p.descripcion)}</p>` : ''}
          <div class="etiquetas">
            <span class="etiqueta"><span class="punto"></span>${escapar(p.categoria)}</span>
            ${etiquetaCupos(p.cupos)}
          </div>
        </div>
        <div class="lado">
          <div class="precio">${moneda.format(p.precio)}<small>por persona</small></div>
          <div class="botones">${htmlBotones(p)}</div>
        </div>
      </div>
    </li>`;
}

function hayFiltros() {
  return Boolean(buscar.value.trim() || filtroCategoria.value || filtroDisponible.value);
}

function render() {
  lista.setAttribute('aria-busy', 'false');
  lista.innerHTML = paquetes.map(htmlPaquete).join('');
  resaltarId = null;

  conteo.textContent = hayFiltros()
    ? `${paquetes.length} de ${totalPaquetes}`
    : plural(totalPaquetes, 'paquete', 'paquetes');

  vacio.hidden = paquetes.length > 0;
  if (!paquetes.length) {
    vacio.innerHTML = hayFiltros()
      ? `<p>Ningún paquete coincide con los filtros.</p><p><button type="button" class="enlace" data-accion="limpiar">Limpiar filtros</button></p>`
      : `<p>Todavía no hay paquetes.</p><p>Completá el formulario <strong>Nuevo paquete</strong> para publicar el primero.</p>`;
  }
}

function renderReservas(reservas) {
  listaReservas.innerHTML = reservas
    .map(
      (r) => `
      <li class="reserva" data-id="${r.id}">
        <div>
          <div class="nombre">${escapar(r.cliente)}</div>
          <div class="meta">${escapar(r.email)}</div>
        </div>
        <div class="col-paquete">
          <div>${r.paquete ? escapar(r.paquete.destino) : '<em>Paquete eliminado</em>'}</div>
          <div class="meta">${r.paquete ? 'Sale el ' + fecha(r.paquete.fechaSalida) : ''}</div>
        </div>
        <span class="personas col-personas">${icono('users')}${r.personas}</span>
        <span class="monto">${moneda.format(r.total)}</span>
        <div class="accion">
          <button data-accion="cancelar-reserva" class="secundario chico">Cancelar</button>
        </div>
      </li>`
    )
    .join('');
  vacioReservas.hidden = reservas.length > 0;
}

function renderStats(todos, reservas) {
  $('stat-paquetes').textContent = todos.length;
  $('stat-cupos').textContent = todos.reduce((s, p) => s + p.cupos, 0);
  $('stat-reservas').textContent = reservas.length;
  $('stat-reservas-txt').textContent = reservas.length === 1 ? 'Reserva' : 'Reservas';
  $('stat-ventas').textContent = moneda.format(reservas.reduce((s, r) => s + r.total, 0));
}

async function cargar() {
  try {
    const params = new URLSearchParams();
    if (buscar.value.trim()) params.set('q', buscar.value.trim());
    if (filtroCategoria.value) params.set('categoria', filtroCategoria.value);
    if (filtroDisponible.value) params.set('disponible', filtroDisponible.value);
    const [filtrados, todos, reservas] = await Promise.all([
      api(`${API_PAQUETES}?${params}`),
      api(API_PAQUETES),
      api(API_RESERVAS),
    ]);
    paquetes = filtrados;
    totalPaquetes = todos.length;
    render();
    renderReservas(reservas);
    renderStats(todos, reservas);
  } catch (err) {
    lista.setAttribute('aria-busy', 'false');
    lista.innerHTML = '';
    vacio.hidden = false;
    vacio.innerHTML = `<p>No se pudieron cargar los paquetes. ¿Está corriendo el servidor?</p><p><button type="button" class="enlace" data-accion="reintentar">Reintentar</button></p>`;
    mostrarToast(err.message, true);
  }
}

async function cargarCategorias() {
  const categorias = await api('/api/categorias');
  const opciones = categorias.map((c) => `<option value="${escapar(c)}">${escapar(c)}</option>`).join('');
  campos.categoria.innerHTML = `<option value="">Elegí una categoría</option>${opciones}`;
  filtroCategoria.insertAdjacentHTML('beforeend', opciones);
}

function resetForm() {
  form.reset();
  form.classList.remove('enviado');
  campos.id.value = '';
  formTitulo.textContent = 'Nuevo paquete';
  btnGuardar.textContent = 'Crear paquete';
  btnCancelar.hidden = true;
  errorForm.hidden = true;
  campos.fechaSalida.min = hoy();
  campos.fechaRegreso.min = hoy();
  document.querySelectorAll('.paquete.editando').forEach((li) => li.classList.remove('editando'));
}

function editar(p) {
  resetForm();
  campos.id.value = p.id;
  for (const campo of CAMPOS_PAQUETE) campos[campo].value = p[campo] ?? '';
  campos.fechaSalida.min = '';
  campos.fechaRegreso.min = p.fechaSalida;
  formTitulo.textContent = `Editar ${p.destino}`;
  btnGuardar.textContent = 'Guardar cambios';
  btnCancelar.hidden = false;
  document.querySelector(`.paquete[data-id="${p.id}"]`)?.classList.add('editando');
  form.closest('.panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  campos.destino.focus({ preventScroll: true });
}

campos.fechaSalida.addEventListener('change', () => {
  campos.fechaRegreso.min = campos.fechaSalida.value;
  if (campos.fechaRegreso.value && campos.fechaRegreso.value < campos.fechaSalida.value) {
    campos.fechaRegreso.value = campos.fechaSalida.value;
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorForm.hidden = true;
  if (!form.checkValidity()) {
    const invalido = form.querySelector(':invalid');
    errorForm.textContent = 'Revisá los campos marcados: ' + (invalido.closest('label')?.firstChild.textContent.trim() || 'datos incompletos') + '.';
    errorForm.hidden = false;
    form.classList.add('enviado');
    invalido.focus();
    return;
  }

  const datos = Object.fromEntries(CAMPOS_PAQUETE.map((c) => [c, campos[c].value]));
  const editando = Boolean(campos.id.value);
  const textoBoton = btnGuardar.textContent;
  btnGuardar.disabled = true;
  btnGuardar.textContent = 'Guardando…';
  try {
    const guardado = editando
      ? await api(`${API_PAQUETES}/${campos.id.value}`, { method: 'PUT', body: JSON.stringify(datos) })
      : await api(API_PAQUETES, { method: 'POST', body: JSON.stringify(datos) });
    mostrarToast(editando ? 'Cambios guardados' : `${guardado.destino} publicado`);
    resaltarId = guardado.id;
    resetForm();
    await cargar();
  } catch (err) {
    errorForm.textContent = err.message;
    errorForm.hidden = false;
    btnGuardar.textContent = textoBoton;
  } finally {
    btnGuardar.disabled = false;
  }
});

btnCancelar.addEventListener('click', resetForm);

function pedirConfirmacion(contenedor, texto, etiquetaSi, alConfirmar) {
  cancelarConfirmaciones();
  contenedor.dataset.original = contenedor.innerHTML;
  contenedor.classList.add('confirmando');
  contenedor.innerHTML = `
    <span class="confirmar">${texto}
      <button data-accion="confirmar-si" class="peligro-solido">${etiquetaSi}</button>
      <button data-accion="confirmar-no" class="secundario chico">No</button>
    </span>`;
  contenedor._alConfirmar = alConfirmar;
  contenedor.querySelector('[data-accion="confirmar-no"]').focus();
  confirmTimer = setTimeout(cancelarConfirmaciones, 6000);
}

function cancelarConfirmaciones() {
  clearTimeout(confirmTimer);
  document.querySelectorAll('.confirmando').forEach((el) => {
    el.innerHTML = el.dataset.original;
    el.classList.remove('confirmando');
    delete el._alConfirmar;
  });
}

async function manejarConfirmacion(boton) {
  const contenedor = boton.closest('.confirmando');
  if (!contenedor) return false;
  if (boton.dataset.accion === 'confirmar-no') {
    cancelarConfirmaciones();
    contenedor.querySelector('[data-accion="borrar"], [data-accion="cancelar-reserva"]')?.focus();
    return true;
  }
  if (boton.dataset.accion === 'confirmar-si') {
    clearTimeout(confirmTimer);
    boton.disabled = true;
    boton.textContent = '…';
    try {
      await contenedor._alConfirmar();
    } catch (err) {
      mostrarToast(err.message, true);
      cancelarConfirmaciones();
    }
    return true;
  }
  return false;
}

function cerrarReserva() {
  document.querySelectorAll('.reserva-form').forEach((f) => f.remove());
  document.querySelectorAll('.paquete.abierto').forEach((li) => li.classList.remove('abierto'));
}

function abrirReserva(li, p) {
  const yaAbierto = li.classList.contains('abierto');
  cerrarReserva();
  if (yaAbierto) return;

  li.classList.add('abierto');
  const f = document.createElement('form');
  f.className = 'reserva-form';
  f.innerHTML = `
    <label>Nombre del cliente
      <input name="cliente" required maxlength="80" autocomplete="name" />
    </label>
    <label>Email
      <input name="email" type="email" required maxlength="120" autocomplete="email" />
    </label>
    <label>Personas
      <span class="stepper">
        <button type="button" data-paso="-1" aria-label="Una persona menos">${icono('minus')}</button>
        <input name="personas" type="number" min="1" max="${p.cupos}" value="1" required inputmode="numeric" />
        <button type="button" data-paso="1" aria-label="Una persona más">${icono('plus')}</button>
      </span>
    </label>
    <div class="reserva-pie">
      <span class="total">Total (${moneda.format(p.precio)} × <span data-personas>1</span>)<strong data-total>${moneda.format(p.precio)}</strong></span>
      <div class="acciones">
        <button type="button" class="secundario chico" data-accion="cerrar-reserva">Cancelar</button>
        <button type="submit" class="reservar">Confirmar reserva</button>
      </div>
    </div>`;
  li.append(f);

  const personas = f.elements.personas;
  const actualizar = () => {
    const n = Math.min(Math.max(parseInt(personas.value, 10) || 1, 1), p.cupos);
    f.querySelector('[data-personas]').textContent = n;
    f.querySelector('[data-total]').textContent = moneda.format(p.precio * n);
    f.querySelector('[data-paso="-1"]').disabled = n <= 1;
    f.querySelector('[data-paso="1"]').disabled = n >= p.cupos;
    return n;
  };
  actualizar();

  personas.addEventListener('input', actualizar);
  personas.addEventListener('blur', () => (personas.value = actualizar()));
  f.addEventListener('click', (e) => {
    const paso = e.target.closest('[data-paso]');
    if (paso) {
      personas.value = actualizar() + Number(paso.dataset.paso);
      actualizar();
    }
    if (e.target.closest('[data-accion="cerrar-reserva"]')) {
      cerrarReserva();
      li.querySelector('[data-accion="reservar"]')?.focus();
    }
  });
  f.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      cerrarReserva();
      li.querySelector('[data-accion="reservar"]')?.focus();
    }
  });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!f.reportValidity()) return;
    const enviar = f.querySelector('[type="submit"]');
    enviar.disabled = true;
    enviar.textContent = 'Reservando…';
    try {
      await api(API_RESERVAS, {
        method: 'POST',
        body: JSON.stringify({
          paqueteId: p.id,
          cliente: f.elements.cliente.value,
          email: f.elements.email.value,
          personas: actualizar(),
        }),
      });
      mostrarToast(`Reserva confirmada para ${f.elements.cliente.value.trim()}`);
      await cargar();
    } catch (err) {
      mostrarToast(err.message, true);
      enviar.disabled = false;
      enviar.textContent = 'Confirmar reserva';
    }
  });

  f.elements.cliente.focus();
}

lista.addEventListener('click', async (e) => {
  const boton = e.target.closest('button[data-accion]');
  if (!boton) return;
  if (await manejarConfirmacion(boton)) return;

  const li = boton.closest('.paquete');
  const p = paquetes.find((x) => x.id === li.dataset.id);
  if (!p) return;

  switch (boton.dataset.accion) {
    case 'reservar':
      abrirReserva(li, p);
      break;
    case 'editar':
      cerrarReserva();
      editar(p);
      break;
    case 'borrar':
      cerrarReserva();
      pedirConfirmacion(boton.closest('.botones'), '¿Eliminar?', 'Eliminar', async () => {
        await api(`${API_PAQUETES}/${p.id}`, { method: 'DELETE' });
        if (campos.id.value === p.id) resetForm();
        mostrarToast(`${p.destino} eliminado`);
        await cargar();
      });
      break;
  }
});

vacio.addEventListener('click', (e) => {
  const accion = e.target.closest('[data-accion]')?.dataset.accion;
  if (accion === 'limpiar') {
    buscar.value = '';
    filtroCategoria.value = '';
    filtroDisponible.value = '';
  }
  if (accion === 'limpiar' || accion === 'reintentar') cargar();
});

listaReservas.addEventListener('click', async (e) => {
  const boton = e.target.closest('button[data-accion]');
  if (!boton) return;
  if (await manejarConfirmacion(boton)) return;

  if (boton.dataset.accion === 'cancelar-reserva') {
    const id = boton.closest('.reserva').dataset.id;
    pedirConfirmacion(boton.closest('.accion'), '¿Cancelar?', 'Sí, cancelar', async () => {
      await api(`${API_RESERVAS}/${id}`, { method: 'DELETE' });
      mostrarToast('Reserva cancelada; los cupos volvieron al paquete');
      await cargar();
    });
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cancelarConfirmaciones();
});

let debounce;
buscar.addEventListener('input', () => {
  clearTimeout(debounce);
  debounce = setTimeout(cargar, 250);
});
filtroCategoria.addEventListener('change', cargar);
filtroDisponible.addEventListener('change', cargar);

let toastTimer;
function mostrarToast(mensaje, esError = false) {
  toast.textContent = mensaje;
  toast.classList.toggle('error', esError);
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), esError ? 4000 : 2600);
}

resetForm();
cargarCategorias()
  .then(cargar)
  .catch((err) => mostrarToast(err.message, true));
