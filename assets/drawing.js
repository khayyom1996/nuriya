/* Nuriya's drawing room. No uploads: the picture stays in this browser. */
(function () {
  'use strict';
  var STORAGE_KEY = 'nuriya.drawing.v1';
  var WIDTH = 1200, HEIGHT = 900;
  var COLORS = [
    { name:'Розовый', value:'#e76b9b' }, { name:'Красный', value:'#ef5350' },
    { name:'Оранжевый', value:'#f39a3f' }, { name:'Жёлтый', value:'#f4ce45', dark:true },
    { name:'Зелёный', value:'#65b56e' }, { name:'Голубой', value:'#56bddd' },
    { name:'Синий', value:'#5279d7' }, { name:'Фиолетовый', value:'#a078c7' },
    { name:'Коричневый', value:'#9d725b' }, { name:'Чёрный', value:'#48424c' }
  ];
  var SIZES = [{ name:'Тонкая', width:12, dot:6 }, { name:'Средняя', width:32, dot:16 }, { name:'Толстая', width:72, dot:28 }];
  var canvas, ctx, room, hint, undoButton, clearButton, dialog, note;
  var built = false, visible = false, strokes = [], active = null, pointer = null;
  var color = COLORS[0].value, brush = SIZES[1].width;
  var memoryOnly = false;

  function setNote(text) { note.textContent = text; }
  function updateTools() {
    room.querySelectorAll('[data-draw-color]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.drawColor === color));
    });
    room.querySelectorAll('[data-draw-size]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.drawSize) === brush));
    });
    document.getElementById('drawColorName').textContent = COLORS.filter(function (c) { return c.value === color; })[0].name;
    document.getElementById('drawSizeName').textContent = SIZES.filter(function (s) { return s.width === brush; })[0].name;
    room.style.setProperty('--brush-color', color);
    hint.hidden = strokes.length > 0;
    undoButton.disabled = clearButton.disabled = strokes.length === 0;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version:1, color:color, brush:brush, strokes:strokes }));
      memoryOnly = false;
      setNote('Рисунок сохраняется только на этом устройстве.');
    } catch (e) {
      memoryOnly = true;
      setNote('Рисунок останется, пока открыта эта страница.');
    }
  }

  function restore() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw || raw.length > 3000000) return;
      var saved = JSON.parse(raw);
      if (!saved || saved.version !== 1 || !Array.isArray(saved.strokes) || saved.strokes.length > 600) return;
      var total = 0;
      var valid = saved.strokes.every(function (s) {
        if (!s || !COLORS.some(function (c) { return c.value === s.color; }) || !SIZES.some(function (b) { return b.width === s.width; }) || !Array.isArray(s.points) || s.points.length < 1 || s.points.length > 12000) return false;
        total += s.points.length;
        return total <= 60000 && s.points.every(function (p) { return Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[0] >= 0 && p[0] <= WIDTH && p[1] >= 0 && p[1] <= HEIGHT; });
      });
      if (!valid) return;
      strokes = saved.strokes;
      if (COLORS.some(function (c) { return c.value === saved.color; })) color = saved.color;
      if (SIZES.some(function (s) { return s.width === saved.brush; })) brush = saved.brush;
    } catch (e) { memoryOnly = true; }
  }

  function dot(point, stroke) {
    ctx.fillStyle = stroke.color;
    ctx.beginPath();
    ctx.arc(point[0], point[1], stroke.width / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function paint(stroke) {
    var points = stroke.points;
    if (!points.length) return;
    dot(points[0], stroke);
    if (points.length === 1) return;
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (var i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.stroke();
  }

  function redraw() {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    strokes.forEach(paint);
    updateTools();
  }

  function position(e) {
    var r = canvas.getBoundingClientRect();
    return [Math.round(Math.max(0, Math.min(WIDTH, (e.clientX - r.left) * WIDTH / r.width)) * 10) / 10,
            Math.round(Math.max(0, Math.min(HEIGHT, (e.clientY - r.top) * HEIGHT / r.height)) * 10) / 10];
  }

  function append(e) {
    if (!active || active.points.length >= 12000) return;
    var p = position(e), last = active.points[active.points.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 0.8) return;
    active.points.push(p);
    ctx.strokeStyle = active.color;
    ctx.lineWidth = active.width;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(last[0], last[1]);
    ctx.lineTo(p[0], p[1]);
    ctx.stroke();
  }

  function finish() {
    if (pointer === null) return;
    var oldPointer = pointer;
    pointer = null;
    active = null;
    try { if (canvas.hasPointerCapture(oldPointer)) canvas.releasePointerCapture(oldPointer); } catch (e) {}
    // Finalize with the same renderer used by undo and storage restoration.
    redraw();
    save();
  }

  function closeDialog() { if (dialog.open) dialog.close(); }

  function build() {
    if (built) return;
    built = true;
    canvas = document.getElementById('drawCanvas');
    ctx = canvas.getContext('2d');
    room = document.querySelector('.drawing-room');
    hint = document.getElementById('drawHint');
    undoButton = document.getElementById('drawUndo');
    clearButton = document.getElementById('drawClear');
    dialog = document.getElementById('drawClearDialog');
    note = document.getElementById('drawNote');
    if (!ctx) { setNote('Рисование не поддерживается этим браузером.'); return; }

    COLORS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'draw-swatch'; b.dataset.drawColor = c.value;
      b.style.setProperty('--swatch', c.value);
      if (c.dark) b.style.setProperty('--check', '#735d31');
      b.setAttribute('aria-label', c.name); b.title = c.name;
      b.addEventListener('click', function () { color = c.value; updateTools(); if (!active) save(); });
      document.getElementById('drawPalette').appendChild(b);
    });
    SIZES.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'draw-size'; b.dataset.drawSize = String(s.width);
      b.setAttribute('aria-label', s.name + ' кисточка'); b.title = s.name + ' кисточка';
      b.innerHTML = '<i aria-hidden="true" style="--size:' + s.dot + 'px"></i>';
      b.addEventListener('click', function () { brush = s.width; updateTools(); if (!active) save(); });
      document.getElementById('drawSizes').appendChild(b);
    });

    canvas.addEventListener('pointerdown', function (e) {
      if (!visible || pointer !== null || e.isPrimary === false || e.button !== 0) return;
      e.preventDefault();
      var total = strokes.reduce(function (n, s) { return n + s.points.length; }, 0);
      if (strokes.length >= 600 || total >= 48000) { setNote('На листе уже много красок! Можно отменить штрих или начать чистый лист.'); return; }
      pointer = e.pointerId;
      active = { color:color, width:brush, points:[position(e)] };
      strokes.push(active);
      try { canvas.setPointerCapture(pointer); } catch (err) {}
      dot(active.points[0], active);
      updateTools();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerId !== pointer || !active) return;
      e.preventDefault();
      var events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      if (!events.length) events = [e];
      events.forEach(append);
    });
    canvas.addEventListener('pointerup', function (e) { if (e.pointerId === pointer) { append(e); finish(); } });
    canvas.addEventListener('pointercancel', function (e) { if (e.pointerId === pointer) finish(); });
    canvas.addEventListener('lostpointercapture', function (e) { if (e.pointerId === pointer) finish(); });
    window.addEventListener('blur', finish);
    document.addEventListener('visibilitychange', function () { if (document.hidden) finish(); });
    window.addEventListener('pagehide', function () { if (built && ctx) { finish(); save(); } });

    undoButton.addEventListener('click', function () { finish(); strokes.pop(); redraw(); save(); });
    clearButton.addEventListener('click', function () {
      finish();
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else if (window.confirm('Очистить рисунок и начать заново?')) { strokes = []; redraw(); save(); }
    });
    document.getElementById('drawKeep').addEventListener('click', closeDialog);
    document.getElementById('drawConfirm').addEventListener('click', function () { strokes = []; closeDialog(); redraw(); save(); });
    dialog.addEventListener('close', function () { if (visible && !clearButton.disabled) clearButton.focus(); });
    restore();
    redraw();
    setNote(memoryOnly ? 'Рисунок останется, пока открыта эта страница.' : 'Рисунок сохраняется только на этом устройстве.');
  }

  window.NuriyaDrawing = {
    build:build,
    enter:function () { visible = true; },
    leave:function () { visible = false; if (built && ctx) { finish(); closeDialog(); save(); } }
  };
})();
