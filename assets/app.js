/* Музична форма — статичний навчальний застосунок. Контент — у data/*.json. */
(function () {
  "use strict";

  var app = document.getElementById("app");
  var STORE_KEY = "muzforma.progress.v1";
  var TAB_KEY = "muzforma.tab.v1";
  var TYPE_LABEL = {
    single: "одна відповідь",
    multi: "кілька відповідей",
    match: "зіставлення",
    order: "схема з карток",
    bars: "межі за тактами",
    error: "знайди помилку"
  };
  var index = null;
  var cache = {};

  /* ---------- storage (works without localStorage too) ---------- */
  var memory = {};
  function loadStore(key) {
    try {
      var raw = window.localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* storage unavailable */ }
    return memory[key] || null;
  }
  function saveStore(key, value) {
    memory[key] = value;
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
  function progress() { return loadStore(STORE_KEY) || {}; }
  function setResult(sid, tid, result) {
    var p = progress();
    p[sid] = p[sid] || {};
    p[sid][tid] = result;
    saveStore(STORE_KEY, p);
  }
  function clearSection(sid) {
    var p = progress();
    delete p[sid];
    saveStore(STORE_KEY, p);
  }

  /* ---------- DOM helper ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === "class") el.className = v;
        else if (k === "text") el.textContent = v;
        else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? "" : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) el.appendChild(typeof x === "string" ? document.createTextNode(x) : x); });
      else el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }

  /* Stable shuffle, seeded by a string, so options keep their order between visits. */
  function seeded(seed) {
    var x = 0;
    for (var i = 0; i < seed.length; i++) x = (x * 31 + seed.charCodeAt(i)) >>> 0;
    return function () {
      x = (x * 1664525 + 1013904223) >>> 0;
      return x / 4294967296;
    };
  }
  function shuffle(arr, seed) {
    var a = arr.slice();
    var rnd = seeded(seed);
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function getJSON(url) {
    if (cache[url]) return Promise.resolve(cache[url]);
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error(url + ": " + r.status);
      return r.json();
    }).then(function (j) { cache[url] = j; return j; });
  }

  function showError(err) {
    app.textContent = "";
    app.appendChild(h("div", { class: "error-box" },
      h("p", { text: "Не вдалося завантажити дані курсу." }),
      h("p", { class: "note", text: "Відкрийте застосунок через вебсервер (наприклад, GitHub Pages), а не як локальний файл. Технічні подробиці: " + (err && err.message ? err.message : err) })));
  }

  /* ---------- routing ---------- */
  function route() {
    var id = (location.hash || "").replace("#", "");
    var entry = index && index.sections.filter(function (s) { return s.id === id && s.ready; })[0];
    if (entry) renderSection(entry);
    else renderHome();
    window.scrollTo(0, 0);
  }

  /* ---------- home ---------- */
  function sectionScore(sid, total) {
    var res = progress()[sid] || {};
    var done = Object.keys(res).length;
    var ok = Object.keys(res).filter(function (k) { return res[k].ok; }).length;
    return { done: done, ok: ok, total: total };
  }

  function renderHome() {
    document.title = index.course;
    app.textContent = "";
    var list = h("ol", { class: "toc" });
    index.sections.forEach(function (s) {
      var num = h("span", { class: "toc-n", text: String(s.n).padStart(2, "0") });
      var title = h("span", { class: "toc-title", text: s.title });
      if (s.ready) {
        var pill = h("span", { class: "pill go", text: "відкрити" });
        var link = h("a", { href: "#" + s.id }, num, title, pill);
        list.appendChild(h("li", null, link));
        getJSON(s.file).then(function (data) {
          var sc = sectionScore(s.id, data.tasks.length);
          if (sc.done) {
            pill.textContent = sc.ok + " / " + sc.total;
            pill.className = "pill" + (sc.done === sc.total ? " done" : " go");
          }
        }).catch(function () {});
      } else {
        list.appendChild(h("li", null, h("span", { class: "soon" }, num, title, h("span", { class: "pill", text: "готується" }))));
      }
    });
    app.appendChild(h("section", { class: "section-head" },
      h("span", { class: "eyebrow", text: "Розділи курсу" }),
      h("h2", { class: "view-title", text: "Від мотиву до циклу" }),
      h("p", { class: "lead", text: "Кожен розділ містить коротку теорію, нотні приклади з точними тактами й завдання з поясненнями. Прогрес зберігається в цьому браузері." })));
    app.appendChild(list);
  }

  /* ---------- section ---------- */
  function renderSection(entry) {
    app.textContent = "";
    app.appendChild(h("p", { class: "loading", text: "Завантаження розділу…" }));
    getJSON(entry.file).then(function (data) {
      document.title = data.title + " · " + index.course;
      app.textContent = "";
      var tabs = loadStore(TAB_KEY) || {};
      var current = tabs[data.id] || "theory";

      var head = h("section", { class: "section-head" },
        h("a", { class: "back", href: "#" }, "← Усі розділи"),
        h("span", { class: "eyebrow", text: "Розділ " + data.n }),
        h("h2", { class: "view-title", text: data.title }),
        h("p", { class: "lead", text: data.lead }));

      var panels = {
        theory: renderTheory(data),
        examples: renderExamples(data),
        tasks: renderTasks(data)
      };
      var names = { theory: "Теорія", examples: "Приклади", tasks: "Завдання" };
      var counts = { theory: "", examples: String(data.examples.length), tasks: String(data.tasks.length) };
      var bar = h("div", { class: "tabs", role: "tablist" });
      Object.keys(names).forEach(function (key) {
        var b = h("button", {
          class: "tab", role: "tab", id: "tab-" + key, type: "button",
          "aria-selected": key === current ? "true" : "false",
          "aria-controls": "panel-" + key,
          onclick: function () { select(key); }
        }, names[key], counts[key] ? h("span", { class: "count", text: counts[key] }) : null);
        bar.appendChild(b);
        panels[key].id = "panel-" + key;
        panels[key].setAttribute("role", "tabpanel");
        panels[key].setAttribute("aria-labelledby", "tab-" + key);
        panels[key].hidden = key !== current;
      });
      function select(key) {
        current = key;
        Object.keys(panels).forEach(function (k) {
          panels[k].hidden = k !== key;
          document.getElementById("tab-" + k).setAttribute("aria-selected", k === key ? "true" : "false");
        });
        var t = loadStore(TAB_KEY) || {};
        t[data.id] = key;
        saveStore(TAB_KEY, t);
      }
      head.appendChild(bar);
      app.appendChild(head);
      Object.keys(panels).forEach(function (k) { app.appendChild(panels[k]); });
    }).catch(showError);
  }

  /* ---------- theory ---------- */
  function renderTheory(data) {
    var wrap = h("section", { class: "theory" });
    data.theory.forEach(function (t) {
      var block = h("article", { class: "topic", id: t.id },
        h("h3", { text: t.term }),
        t.definition ? h("p", { class: "def", text: t.definition }) : null,
        t.motto ? h("p", { class: "motto", text: t.motto }) : null,
        t.scheme ? h("span", { class: "scheme", text: "Схема: " + t.scheme }) : null);
      if (t.source) block.appendChild(h("span", { class: "src", text: t.source }));
      if (t.steps) block.appendChild(h("ol", { class: "steps" }, t.steps.map(function (p) { return h("li", { text: p }); })));
      if (t.points) {
        block.appendChild(h("ul", { class: "points" }, t.points.map(function (p) { return h("li", { text: p }); })));
        if (t.pointsSource) block.appendChild(h("span", { class: "src", text: t.pointsSource }));
      }
      if (t.table) {
        block.appendChild(h("dl", { class: "deflist" }, t.table.map(function (r) {
          return h("div", null,
            h("dt", null, r.name, h("span", { class: "formula", text: r.formula })),
            h("dd", null, h("span", { text: r.text }), r.source ? h("span", { class: "src", text: r.source }) : null));
        })));
      }
      if (t.list) {
        block.appendChild(h("dl", { class: "deflist" }, t.list.map(function (r) {
          return h("div", null,
            h("dt", { text: r.name }),
            h("dd", null, h("span", { text: r.text }), r.source ? h("span", { class: "src", text: r.source }) : null));
        })));
      }
      wrap.appendChild(block);
    });
    return wrap;
  }

  /* ---------- examples ---------- */
  function ruler(r) {
    var row = h("div", { class: "ruler", role: "img" });
    var bar = r.start;
    var desc = [];
    r.groups.forEach(function (g, i) {
      var cells = h("div", { class: "rg-cells" });
      for (var k = 0; k < g.len; k++) cells.appendChild(h("span"));
      var grp = h("div", { class: "rg", style: "flex:" + g.len + " 1 0" },
        h("span", { class: "rg-num", text: String(bar) }),
        i === r.groups.length - 1 ? h("span", { class: "rg-num rg-end", text: String(bar + g.len - 1) }) : null,
        cells,
        h("span", { class: "rg-label", text: g.label }));
      desc.push("тт. " + bar + "–" + (bar + g.len - 1) + ": " + g.label);
      bar += g.len;
      row.appendChild(grp);
    });
    row.setAttribute("aria-label", "Будова за тактами. " + desc.join("; "));
    return row;
  }

  function renderExamples(data) {
    var wrap = h("section", { class: "examples" });
    wrap.appendChild(h("p", { class: "note", text: index.barNote }));
    data.examples.forEach(function (e) {
      wrap.appendChild(h("article", { class: "ex", id: e.id },
        h("span", { class: "eyebrow", text: e.topic }),
        h("h3", { text: e.composer + ". " + e.work }),
        h("div", { class: "meta" },
          h("span", null, h("b", { text: e.part })),
          h("span", null, "Такти: ", h("b", { text: e.bars })),
          h("span", null, "Видання: ", h("b", { text: e.edition }))),
        e.image ? h("figure", { class: "ex-fig" },
          h("a", { href: e.image.src, target: "_blank", rel: "noopener" }, h("img", { src: e.image.src, alt: e.image.alt, loading: "lazy" })),
          e.image.caption ? h("figcaption", { text: e.image.caption }) : null) : null,
        e.ruler ? ruler(e.ruler) : null,
        h("p", { text: e.analysis }),
        e.extra ? h("ul", { class: "points" }, e.extra.map(function (x) { return h("li", { text: x }); })) : null,
        e.extraSource ? h("span", { class: "src", text: e.extraSource }) : null,
        h("div", { class: "ex-foot" },
          h("span", { class: "src", text: e.source }),
          e.imslp ? h("a", { class: "imslp", href: e.imslp, target: "_blank", rel: "noopener" }, "Ноти в IMSLP ↗") : null)));
    });
    return wrap;
  }

  /* ---------- tasks ---------- */
  function renderTasks(data) {
    var wrap = h("section", { class: "tasks-wrap", style: "display:grid;gap:1.5rem" });
    var scoreText = h("span", { class: "score" });
    var resetBtn = h("button", {
      class: "btn ghost", type: "button",
      onclick: function () {
        if (resetBtn.dataset.armed) {
          clearSection(data.id);
          var fresh = renderTasks(data);
          fresh.id = wrap.id; fresh.setAttribute("role", "tabpanel"); fresh.setAttribute("aria-labelledby", wrap.getAttribute("aria-labelledby"));
          wrap.replaceWith(fresh);
        } else {
          resetBtn.dataset.armed = "1";
          resetBtn.textContent = "Натисніть ще раз, щоб стерти відповіді";
          setTimeout(function () { delete resetBtn.dataset.armed; resetBtn.textContent = "Почати розділ знову"; }, 4000);
        }
      }
    }, "Почати розділ знову");
    function updateScore() {
      var sc = sectionScore(data.id, data.tasks.length);
      scoreText.textContent = "";
      scoreText.appendChild(document.createTextNode("Правильно: "));
      scoreText.appendChild(h("b", { text: sc.ok + " з " + sc.total }));
      scoreText.appendChild(document.createTextNode(sc.done < sc.total ? " · виконано " + sc.done : " · розділ пройдено"));
    }
    wrap.appendChild(h("div", { class: "scorebar" }, scoreText, resetBtn));
    var list = h("div", { class: "tasks" });
    var saved = progress()[data.id] || {};
    data.tasks.forEach(function (t, i) {
      list.appendChild(renderTask(data.id, t, i + 1, saved[t.id], updateScore));
    });
    wrap.appendChild(list);
    updateScore();
    return wrap;
  }

  function renderTask(sid, t, num, saved, onDone) {
    var card = h("article", { class: "task", id: sid + "-" + t.id });
    card.appendChild(h("div", { class: "task-head" },
      h("span", { class: "task-num", text: "Завдання " + num }),
      h("span", { class: "task-type", text: TYPE_LABEL[t.type] || t.type })));
    card.appendChild(h("p", { class: "task-q", text: t.q }));
    var body = h("div");
    card.appendChild(body);
    var checkBtn = h("button", { class: "btn", type: "button" }, "Перевірити");
    var btns = h("div", { class: "btns" }, checkBtn);
    card.appendChild(btns);
    var kind = KINDS[t.type];
    var ui = kind.build(t, body, sid);

    function finish(given, fromSaved) {
      var ok = kind.grade(t, given);
      kind.reveal(t, ui, given);
      ui.lock();
      checkBtn.remove();
      card.classList.add(ok ? "is-ok" : "is-bad");
      var fb = h("div", { class: "feedback" + (ok ? "" : " bad") },
        h("strong", { text: ok ? "Правильно." : "Неправильно." }),
        !ok && kind.answerText ? h("p", { class: "correct-answer", text: "Правильна відповідь: " + kind.answerText(t) }) : null,
        h("p", { text: t.explain }));
      card.appendChild(fb);
      if (!fromSaved) {
        setResult(sid, t.id, { ok: ok, given: given });
        onDone();
      }
    }
    checkBtn.addEventListener("click", function () {
      var given = ui.value();
      if (given === null) {
        checkBtn.textContent = "Спочатку дайте відповідь";
        setTimeout(function () { checkBtn.textContent = "Перевірити"; }, 1800);
        return;
      }
      finish(given, false);
    });
    if (saved && saved.given !== undefined) {
      ui.restore(saved.given);
      finish(saved.given, true);
    }
    return card;
  }

  function optionList(t, body, sid, multi) {
    var name = sid + "-" + t.id;
    var opts = t.options || t.statements;
    var labels = [];
    var box = h("div", { class: "opts" });
    opts.forEach(function (o, i) {
      var input = h("input", { type: multi ? "checkbox" : "radio", name: name, value: String(i), id: name + "-" + i });
      var lab = h("label", { class: "opt", for: name + "-" + i }, input, h("span", { text: o }));
      labels.push(lab);
      box.appendChild(lab);
    });
    body.appendChild(box);
    function inputs() { return Array.prototype.slice.call(box.querySelectorAll("input")); }
    return {
      labels: labels,
      value: function () {
        var chosen = inputs().filter(function (x) { return x.checked; }).map(function (x) { return Number(x.value); });
        if (!chosen.length) return null;
        return multi ? chosen : chosen[0];
      },
      restore: function (g) {
        var set = multi ? g : [g];
        inputs().forEach(function (x) { x.checked = set.indexOf(Number(x.value)) !== -1; });
      },
      lock: function () { inputs().forEach(function (x) { x.disabled = true; }); }
    };
  }

  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    var x = a.slice().sort(), y = b.slice().sort();
    return x.every(function (v, i) { return v === y[i]; });
  }

  var KINDS = {
    single: {
      build: function (t, body, sid) { return optionList(t, body, sid, false); },
      grade: function (t, g) { return g === t.answer; },
      reveal: function (t, ui, g) {
        ui.labels.forEach(function (l, i) {
          if (i === t.answer) l.classList.add("right");
          else if (i === g) l.classList.add("wrong");
        });
      },
      answerText: function (t) { return t.options[t.answer]; }
    },
    error: {
      build: function (t, body, sid) {
        body.appendChild(h("p", { class: "note", text: "Оберіть твердження, яке містить помилку." }));
        return optionList(t, body, sid, false);
      },
      grade: function (t, g) { return g === t.answer; },
      reveal: function (t, ui, g) {
        ui.labels.forEach(function (l, i) {
          if (i === t.answer) l.classList.add("right");
          else if (i === g) l.classList.add("wrong");
        });
      },
      answerText: function (t) { return "помилкове твердження — «" + t.statements[t.answer] + "»"; }
    },
    multi: {
      build: function (t, body, sid) { return optionList(t, body, sid, true); },
      grade: function (t, g) { return sameSet(g, t.answer); },
      reveal: function (t, ui, g) {
        ui.labels.forEach(function (l, i) {
          var should = t.answer.indexOf(i) !== -1, picked = g.indexOf(i) !== -1;
          if (should) l.classList.add("right");
          else if (picked) l.classList.add("wrong");
        });
      },
      answerText: function (t) { return t.answer.map(function (i) { return t.options[i]; }).join("; "); }
    },
    match: {
      build: function (t, body, sid) {
        var rights = shuffle(t.pairs.map(function (p) { return p[1]; }), sid + t.id);
        var selects = [];
        var box = h("div");
        t.pairs.forEach(function (p, i) {
          var id = sid + "-" + t.id + "-m" + i;
          var sel = h("select", { id: id }, h("option", { value: "", text: "— оберіть —" }),
            rights.map(function (r) { return h("option", { value: r, text: r }); }));
          selects.push(sel);
          box.appendChild(h("div", { class: "match-row" }, h("label", { for: id, text: p[0] }), sel));
        });
        body.appendChild(box);
        return {
          selects: selects,
          value: function () {
            var v = selects.map(function (s) { return s.value; });
            return v.some(function (x) { return !x; }) ? null : v;
          },
          restore: function (g) { selects.forEach(function (s, i) { s.value = g[i] || ""; }); },
          lock: function () { selects.forEach(function (s) { s.disabled = true; }); }
        };
      },
      grade: function (t, g) { return t.pairs.every(function (p, i) { return g[i] === p[1]; }); },
      reveal: function (t, ui, g) {
        ui.selects.forEach(function (s, i) { s.classList.add(g[i] === t.pairs[i][1] ? "is-right" : "is-wrong"); });
      },
      answerText: function (t) { return t.pairs.map(function (p) { return p[0] + " — " + p[1]; }).join("; "); }
    },
    order: {
      build: function (t, body, sid) {
        var pool = shuffle(t.cards.concat(t.distractors || []), sid + t.id);
        var line = h("div", { class: "card-line", "aria-label": "Ваша схема" });
        var poolBox = h("div", { class: "card-pool", "aria-label": "Картки" });
        var chosen = [];
        var locked = false;
        var poolBtns = pool.map(function (label, idx) {
          var b = h("button", { class: "chip", type: "button", text: label });
          b.addEventListener("click", function () {
            if (locked || b.disabled) return;
            b.disabled = true;
            chosen.push(idx);
            draw();
          });
          return b;
        });
        poolBtns.forEach(function (b) { poolBox.appendChild(b); });
        function draw() {
          line.textContent = "";
          chosen.forEach(function (idx, pos) {
            var c = h("button", { class: "chip", type: "button", text: pool[idx], "aria-label": pool[idx] + ", прибрати" });
            c.addEventListener("click", function () {
              if (locked) return;
              chosen.splice(pos, 1);
              poolBtns[idx].disabled = false;
              draw();
            });
            line.appendChild(c);
          });
        }
        body.appendChild(h("span", { class: "order-label", text: "Ваша схема:" }));
        body.appendChild(line);
        body.appendChild(h("span", { class: "order-label", text: "Картки (натисніть, щоб додати; у схемі — щоб прибрати):" }));
        body.appendChild(poolBox);
        return {
          line: line,
          value: function () { return chosen.length ? chosen.map(function (i) { return pool[i]; }) : null; },
          restore: function (g) {
            chosen = [];
            var used = {};
            g.forEach(function (label) {
              for (var i = 0; i < pool.length; i++) {
                if (pool[i] === label && !used[i]) { used[i] = true; chosen.push(i); poolBtns[i].disabled = true; break; }
              }
            });
            draw();
          },
          lock: function () { locked = true; poolBtns.forEach(function (b) { b.disabled = true; }); }
        };
      },
      grade: function (t, g) { return g.length === t.cards.length && g.every(function (x, i) { return x === t.cards[i]; }); },
      reveal: function (t, ui, g) { ui.line.classList.add(KINDS.order.grade(t, g) ? "is-right" : "is-wrong"); },
      answerText: function (t) { return t.cards.join(" → "); }
    },
    bars: {
      build: function (t, body, sid) {
        var inputs = [];
        var box = h("div");
        t.fields.forEach(function (f, i) {
          var id = sid + "-" + t.id + "-b" + i;
          var inp = h("input", { type: "number", id: id, min: "1", step: "1", inputmode: "numeric" });
          inputs.push(inp);
          box.appendChild(h("div", { class: "field-row" }, h("label", { for: id, text: f.label }), inp));
        });
        body.appendChild(box);
        return {
          inputs: inputs,
          value: function () {
            var v = inputs.map(function (x) { return x.value === "" ? null : Number(x.value); });
            return v.some(function (x) { return x === null || isNaN(x); }) ? null : v;
          },
          restore: function (g) { inputs.forEach(function (x, i) { x.value = g[i]; }); },
          lock: function () { inputs.forEach(function (x) { x.disabled = true; }); }
        };
      },
      grade: function (t, g) { return t.fields.every(function (f, i) { return g[i] === f.answer; }); },
      reveal: function (t, ui, g) {
        ui.inputs.forEach(function (x, i) { x.classList.add(g[i] === t.fields[i].answer ? "is-right" : "is-wrong"); });
      },
      answerText: function (t) { return t.fields.map(function (f) { return f.label + " " + f.answer; }).join("; "); }
    }
  };

  /* ---------- boot ---------- */
  getJSON("data/sections.json").then(function (j) {
    index = j;
    window.addEventListener("hashchange", route);
    route();
  }).catch(showError);
})();
