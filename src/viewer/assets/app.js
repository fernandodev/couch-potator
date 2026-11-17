(() => {
  "use strict";

  const STATUS_ORDER = ["todo", "in-progress", "blocked", "done"];
  const STATUS_LABEL = {
    todo: "Todo",
    "in-progress": "In progress",
    blocked: "Blocked",
    done: "Done",
  };
  const KINDS = ["foundation", "design", "feature", "quality", "release", "fix"];

  const NODE_W = 204;
  const NODE_H = 78;
  const GAP_X = 74;
  const GAP_Y = 18;
  const PAD = 40;

  const MAX_DEPTH = 9;

  const app = {
    data: null,
    projectSlug: null,
    view: "board",
    milestone: null,
    specId: null,
    brief: false,
    graph: { x: 0, y: 0, k: 1, manual: false, width: 0, height: 0 },
    modalSig: "",
  };

  const $ = (id) => document.getElementById(id);

  const esc = (value) =>
    String(value == null ? "" : value).replace(/[&<>"']/g, (char) => {
      switch (char) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        default:
          return "&#39;";
      }
    });

  const kindClass = (kind) => (KINDS.includes(kind) ? kind : "other");

  const shortId = (id) => String(id).split("-").slice(0, 2).join("-");

  const currentProject = () =>
    (app.data?.projects || []).find((project) => project.slug === app.projectSlug) || null;

  // ----------------------------------------------------------- local storage

  function stored(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function store(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* file:// origins may refuse storage; the URL hash is the fallback */
    }
  }

  // --------------------------------------------------------------- milestones

  const milestonesOf = (project) => project?.milestones || [];

  const milestoneText = (value) => `Milestone ${value}`;

  function chooseMilestone(project, raw) {
    const milestones = milestonesOf(project);
    if (!milestones.length) return null;

    const value = String(raw ?? "").trim();
    if (value === "all") return null;
    if (/^\d+$/.test(value)) {
      const digits = Number(value);
      if (milestones.includes(digits)) return digits;
    }

    const current = project?.current_milestone;
    return milestones.includes(current) ? current : null;
  }

  function normaliseMilestone(project) {
    const milestones = milestonesOf(project);
    if (!milestones.length) {
      app.milestone = null;
      return;
    }
    if (app.milestone != null && !milestones.includes(app.milestone)) {
      app.milestone = chooseMilestone(project, null);
    }
  }

  function visibleSpecs(project) {
    if (!project) return [];
    if (app.milestone == null) return project.specs;
    return project.specs.filter((spec) => spec.milestone === app.milestone);
  }

  // Other-milestone specs one hop away from what is shown, so dependencies stay
  // traceable in the graph. They are drawn faded and never counted as cards.
  function contextSpecs(project, visible) {
    if (!project || app.milestone == null) return [];

    const shown = new Set(visible.map((spec) => spec.id));
    const byId = new Map(project.specs.map((spec) => [spec.id, spec]));
    const context = new Map();

    for (const spec of visible) {
      for (const dep of spec.depends_on) {
        const target = byId.get(dep);
        if (target && !shown.has(target.id)) context.set(target.id, target);
      }
    }
    for (const spec of project.specs) {
      if (shown.has(spec.id)) continue;
      if (spec.depends_on.some((dep) => shown.has(dep))) context.set(spec.id, spec);
    }

    return Array.from(context.values());
  }

  // ---------------------------------------------------------------- markdown

  function configureMarkdown() {
    marked.setOptions({ gfm: true, breaks: false });

    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    });
  }

  function renderMarkdown(source) {
    const html = marked.parse(String(source || ""));
    return DOMPurify.sanitize(html, {
      FORBID_TAGS: ["script", "style", "iframe", "form", "object", "embed"],
      FORBID_ATTR: ["style"],
    });
  }

  function stripHeading(markdown, needles) {
    const lines = String(markdown || "").split("\n");
    if (lines.length && /^#\s+/.test(lines[0])) {
      const heading = lines[0].replace(/^#\s+/, "");
      const matches =
        !needles.length || needles.some((needle) => needle && heading.includes(needle));
      if (matches) {
        lines.shift();
        while (lines.length && !lines[0].trim()) lines.shift();
      }
    }
    return lines.join("\n");
  }

  function specBody(spec) {
    return stripHeading(spec.body, [spec.id, spec.title]);
  }

  // ------------------------------------------------------------------- state

  function loadData() {
    const node = $("board-data");
    if (!node) {
      app.data = null;
      return;
    }
    try {
      const parsed = JSON.parse(node.textContent || "{}");
      app.data = parsed && Array.isArray(parsed.projects) ? parsed : null;
    } catch {
      app.data = null;
    }
  }

  // ------------------------------------------------------------------ scroll

  function captureScroll() {
    const board = document.querySelector(".board");
    return {
      boardLeft: board ? board.scrollLeft : 0,
      columns: Array.from(document.querySelectorAll(".column .cards")).map(
        (column) => column.scrollTop,
      ),
      modal: document.querySelector(".modal-body")?.scrollTop ?? 0,
    };
  }

  function restoreScroll(scroll) {
    if (!scroll) return;
    const board = document.querySelector(".board");
    if (board) board.scrollLeft = scroll.boardLeft;
    document.querySelectorAll(".column .cards").forEach((column, index) => {
      if (scroll.columns[index] != null) column.scrollTop = scroll.columns[index];
    });
    const modal = document.querySelector(".modal-body");
    if (modal && scroll.modal) modal.scrollTop = scroll.modal;
  }

  // ------------------------------------------------------------------ header

  function renderHeader() {
    const projects = app.data?.projects || [];
    const project = currentProject();
    const slot = $("projectSlot");
    const milestoneSelect = milestoneSelectHtml(project);

    if (projects.length > 1) {
      slot.innerHTML = `<select id="projectSelect" aria-label="Project">${projects
        .map(
          (item) =>
            `<option value="${esc(item.slug)}"${item.slug === app.projectSlug ? " selected" : ""}>${esc(item.name)}</option>`,
        )
        .join("")}</select>${milestoneSelect}`;
    } else if (project) {
      slot.innerHTML =
        `<span class="project-name">${esc(project.name)}</span>` + milestoneSelect;
    } else {
      slot.innerHTML = "";
    }

    document.querySelectorAll("[data-view]").forEach((button) => {
      const active = button.dataset.view === app.view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });

    const pill = $("readonlyPill");
    if (pill) {
      pill.title = app.data?.generated
        ? `Read-only view generated ${app.data.generated}. Re-run couch-potator view after changes.`
        : "Read-only view";
    }
    $("briefBtn").disabled = !project;

    document.title = project ? `Board · ${project.name}` : "Board";
  }

  function milestoneSelectHtml(project) {
    const milestones = milestonesOf(project);
    if (!milestones.length) return "";

    const options = [
      `<option value="all"${app.milestone == null ? " selected" : ""}>All milestones</option>`,
      ...milestones.map(
        (value) =>
          `<option value="${esc(value)}"${app.milestone === value ? " selected" : ""}>${esc(milestoneText(value))}</option>`,
      ),
    ];

    return `<select id="milestoneSelect" aria-label="Milestone">${options.join("")}</select>`;
  }

  // ------------------------------------------------------------------- board

  function renderBoard() {
    const project = currentProject();
    const main = $("main");
    main.className = "board-view";

    if (!project) {
      main.innerHTML = emptyProjectsHtml();
      return;
    }
    if (!project.specs.length) {
      main.innerHTML = emptyProjectHtml(project);
      return;
    }

    const specs = visibleSpecs(project);
    if (!specs.length) {
      main.innerHTML = emptyMilestoneHtml(project);
      return;
    }

    const columns = STATUS_ORDER.map((status) => {
      const inColumn = specs.filter((spec) => spec.status === status);
      const cards = inColumn.length
        ? inColumn.map(cardHtml).join("")
        : `<p class="column-empty">No cards</p>`;

      return `
        <section class="column" data-status="${status}">
          <header class="column-head">
            <span class="status-dot"></span>
            <h2>${esc(STATUS_LABEL[status])}</h2>
            <span class="count">${inColumn.length}</span>
          </header>
          <div class="cards">${cards}</div>
        </section>`;
    }).join("");

    const scroll = captureScroll();
    main.innerHTML = `<div class="board">${columns}</div>`;
    restoreScroll(scroll);
  }

  function cardHtml(spec) {
    return `<button type="button" class="card kind-${kindClass(spec.kind)}" data-spec="${esc(spec.id)}" title="${esc(spec.title)}">
      <span class="card-title">${esc(spec.title)}</span>
    </button>`;
  }

  function emptyProjectsHtml() {
    const workspace = app.data?.workspace || "";
    return `<div class="empty">
      <h1>No board data</h1>
      <p>This page has no embedded board. Regenerate it with <code>couch-potator view</code>.</p>
      ${workspace ? `<p class="empty-path">${esc(workspace)}</p>` : ""}
    </div>`;
  }

  function emptyProjectHtml(project) {
    return `<div class="empty">
      <h1>${esc(project.name)} has no specs yet</h1>
      <p>Cards appear here as soon as they are written into the board folders. Start with
      <code>couch-potator add "First card"</code>.</p>
    </div>`;
  }

  function emptyMilestoneHtml(project) {
    return `<div class="empty">
      <h1>No specs in ${esc(milestoneText(app.milestone))}</h1>
      <p>${esc(project.name)} has ${project.specs.length} specs, but none in this milestone. Choose <b>All milestones</b> in the header to see them.</p>
    </div>`;
  }

  // ------------------------------------------------------------------- graph

  function layoutGraph(specs) {
    const byId = new Map(specs.map((spec) => [spec.id, spec]));
    const depth = new Map();
    const visiting = new Set();

    const walk = (id) => {
      if (depth.has(id)) return depth.get(id);
      if (visiting.has(id)) return 0;
      visiting.add(id);
      let value = 0;
      const spec = byId.get(id);
      for (const dep of spec?.depends_on || []) {
        if (!byId.has(dep)) continue;
        value = Math.max(value, walk(dep) + 1);
      }
      visiting.delete(id);
      value = Math.min(value, MAX_DEPTH);
      depth.set(id, value);
      return value;
    };

    for (const spec of specs) walk(spec.id);

    const maxDepth = Math.max(0, ...specs.map((spec) => depth.get(spec.id) || 0));
    const columns = Array.from({ length: maxDepth + 1 }, () => []);
    for (const spec of specs) columns[depth.get(spec.id) || 0].push(spec);
    for (const column of columns) column.sort((a, b) => a.id.localeCompare(b.id));

    const heights = columns.map(
      (column) => column.length * NODE_H + Math.max(0, column.length - 1) * GAP_Y,
    );
    const tallest = Math.max(1, ...heights);
    const positions = new Map();

    columns.forEach((column, columnIndex) => {
      const top = (tallest - heights[columnIndex]) / 2;
      column.forEach((spec, rowIndex) => {
        positions.set(spec.id, {
          x: PAD + columnIndex * (NODE_W + GAP_X),
          y: PAD + top + rowIndex * (NODE_H + GAP_Y),
        });
      });
    });

    return {
      positions,
      width: PAD * 2 + (maxDepth + 1) * NODE_W + maxDepth * GAP_X,
      height: PAD * 2 + tallest,
    };
  }

  function wrapTitle(title) {
    const words = String(title).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";

    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > 25 && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    if (lines.length <= 2) return lines;

    const second = lines[1].length > 24 ? `${lines[1].slice(0, 23)}…` : `${lines[1]}…`;
    return [lines[0], second];
  }

  function nodeSvg(spec, position, context = false) {
    if (!position) return "";
    const lines = wrapTitle(spec.title);
    const block = 10 + 6 + lines.length * 17;
    const top = (NODE_H - block) / 2;
    const idY = top + 9;
    const titleY = idY + 19;
    const tspans = lines
      .map((line, index) => `<tspan x="16" dy="${index === 0 ? 0 : 17}">${esc(line)}</tspan>`)
      .join("");

    return `<g class="node kind-${kindClass(spec.kind)} status-${esc(spec.status)}${context ? " is-context" : ""}" data-spec="${esc(spec.id)}" transform="translate(${position.x} ${position.y})">
      <rect class="node-bg" width="${NODE_W}" height="${NODE_H}" rx="10"></rect>
      <rect class="node-stripe" x="0" y="11" width="4" height="${NODE_H - 22}" rx="2"></rect>
      <text class="node-id" x="16" y="${idY}">${esc(shortId(spec.id))}</text>
      <text class="node-title" x="16" y="${titleY}">${tspans}</text>
    </g>`;
  }

  function edgePath(from, to, fromId, toId, context = false) {
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;
    const bend = Math.max(36, (x2 - x1) * 0.5);

    return `<path class="edge${context ? " is-context" : ""}" data-from="${esc(fromId)}" data-to="${esc(toId)}"
      d="M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2 - 7} ${y2}"
      marker-end="url(#arrow)"></path>`;
  }

  function legendHtml(hasContext) {
    return (
      STATUS_ORDER.map(
        (status) =>
          `<span class="legend-item"><i class="dot status-${status}"></i>${esc(STATUS_LABEL[status])}</span>`,
      ).join("") +
      `<span class="legend-item legend-note"><i class="arrow"></i>arrow points at the dependent spec</span>` +
      (hasContext
        ? `<span class="legend-item legend-note"><i class="swatch"></i>faded = another milestone</span>`
        : "")
    );
  }

  function renderGraph() {
    const project = currentProject();
    const main = $("main");
    main.className = "graph-view";

    if (!project) {
      main.innerHTML = emptyProjectsHtml();
      return;
    }
    if (!project.specs.length) {
      main.innerHTML = emptyProjectHtml(project);
      return;
    }

    const visible = visibleSpecs(project);
    if (!visible.length) {
      main.innerHTML = emptyMilestoneHtml(project);
      return;
    }

    const context = contextSpecs(project, visible);
    const nodes = visible.concat(context);
    const faded = new Set(context.map((spec) => spec.id));

    const layout = layoutGraph(nodes);
    const edges = [];
    for (const spec of nodes) {
      const to = layout.positions.get(spec.id);
      if (!to) continue;
      for (const dep of spec.depends_on) {
        const from = layout.positions.get(dep);
        if (!from) continue;
        const isContext = faded.has(spec.id) || faded.has(dep);
        edges.push(edgePath(from, to, dep, spec.id, isContext));
      }
    }

    const nodeMarkup = nodes
      .map((spec) => nodeSvg(spec, layout.positions.get(spec.id), faded.has(spec.id)))
      .join("");

    main.innerHTML = `
      <svg class="graph" id="graphSvg" aria-label="Dependency graph">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5"
            markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#bcd2ea"></path>
          </marker>
        </defs>
        <g id="viewport">${edges.join("")}${nodeMarkup}</g>
      </svg>
      <div class="graph-toolbar">
        <button type="button" class="ghost-btn" id="fitBtn">Fit</button>
      </div>
      <div class="graph-hint">drag to pan · scroll to zoom · click a card to read it</div>
      <div class="graph-legend">${legendHtml(context.length > 0)}</div>
    `;

    const svg = $("graphSvg");
    const rect = svg.getBoundingClientRect();
    app.graph.width = Math.max(rect.width, 320);
    app.graph.height = Math.max(rect.height, 260);
    svg.setAttribute("viewBox", `0 0 ${app.graph.width} ${app.graph.height}`);

    if (!app.graph.manual) fitGraph(layout);
    applyTransform();
    wireGraph(layout, nodes);
  }

  function fitGraph(layout) {
    const { width, height } = app.graph;
    const scale = Math.min((width - 56) / layout.width, (height - 104) / layout.height, 1.1);
    app.graph.k = Math.max(0.18, scale);
    app.graph.x = (width - layout.width * app.graph.k) / 2;
    app.graph.y = (height - layout.height * app.graph.k) / 2;
    app.graph.manual = false;
  }

  function applyTransform() {
    const viewport = $("viewport");
    if (!viewport) return;
    viewport.setAttribute(
      "transform",
      `translate(${app.graph.x} ${app.graph.y}) scale(${app.graph.k})`,
    );
  }

  function wireGraph(layout, specs) {
    const svg = $("graphSvg");
    const fitBtn = $("fitBtn");

    const neighbours = new Map();
    const link = (a, b) => {
      if (!neighbours.has(a)) neighbours.set(a, new Set());
      neighbours.get(a).add(b);
    };
    for (const spec of specs) {
      for (const dep of spec.depends_on) {
        if (!layout.positions.has(dep)) continue;
        link(spec.id, dep);
        link(dep, spec.id);
      }
    }

    const clearHighlight = () => {
      svg.classList.remove("has-hover");
      svg.querySelectorAll(".is-near").forEach((node) => node.classList.remove("is-near"));
      svg.querySelectorAll(".is-hot").forEach((edge) => edge.classList.remove("is-hot"));
    };

    const highlight = (id) => {
      svg.classList.add("has-hover");
      const near = neighbours.get(id) || new Set();
      svg.querySelectorAll(".node").forEach((node) => {
        node.classList.toggle("is-near", node.dataset.spec === id || near.has(node.dataset.spec));
      });
      svg.querySelectorAll(".edge").forEach((edge) => {
        edge.classList.toggle("is-hot", edge.dataset.from === id || edge.dataset.to === id);
      });
    };

    svg.addEventListener("mouseover", (event) => {
      const node = event.target.closest?.(".node");
      if (!node) return;
      if (event.relatedTarget && node.contains(event.relatedTarget)) return;
      highlight(node.dataset.spec);
    });

    svg.addEventListener("mouseout", (event) => {
      const node = event.target.closest?.(".node");
      if (!node) return;
      if (event.relatedTarget && node.contains(event.relatedTarget)) return;
      clearHighlight();
    });

    let drag = null;
    svg.addEventListener("pointerdown", (event) => {
      if (event.target.closest?.(".node")) return;
      drag = { x: event.clientX, y: event.clientY, ox: app.graph.x, oy: app.graph.y };
      svg.classList.add("dragging");
      try {
        svg.setPointerCapture(event.pointerId);
      } catch {
        /* pointer capture is best effort */
      }
    });

    svg.addEventListener("pointermove", (event) => {
      if (!drag) return;
      app.graph.x = drag.ox + (event.clientX - drag.x);
      app.graph.y = drag.oy + (event.clientY - drag.y);
      app.graph.manual = true;
      applyTransform();
    });

    const endDrag = () => {
      drag = null;
      svg.classList.remove("dragging");
    };
    svg.addEventListener("pointerup", endDrag);
    svg.addEventListener("pointercancel", endDrag);

    svg.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const rect = svg.getBoundingClientRect();
        const mx = event.clientX - rect.left;
        const my = event.clientY - rect.top;
        const factor = Math.exp(-event.deltaY * 0.0016);
        const next = Math.min(2.6, Math.max(0.18, app.graph.k * factor));
        const ratio = next / app.graph.k;
        app.graph.x = mx - (mx - app.graph.x) * ratio;
        app.graph.y = my - (my - app.graph.y) * ratio;
        app.graph.k = next;
        app.graph.manual = true;
        applyTransform();
      },
      { passive: false },
    );

    svg.addEventListener("dblclick", () => {
      fitGraph(layout);
      applyTransform();
    });

    fitBtn?.addEventListener("click", () => {
      fitGraph(layout);
      applyTransform();
    });
  }

  // ------------------------------------------------------------------- modal

  function renderModal(force = false) {
    const root = $("modalRoot");
    const project = currentProject();
    const spec = app.brief ? null : project?.specs.find((item) => item.id === app.specId);

    if (!project || (!app.brief && !spec)) {
      if (root.innerHTML) root.innerHTML = "";
      app.modalSig = "";
      document.body.classList.remove("modal-open");
      return;
    }

    const key = app.brief
      ? `brief:${project.slug}:${project.brief.length}`
      : `${spec.id}:${spec.status}:${spec.body.length}`;

    if (!force && key === app.modalSig && root.innerHTML) return;
    app.modalSig = key;

    const scrollTop = document.querySelector(".modal-body")?.scrollTop ?? 0;

    if (app.brief) {
      root.innerHTML = `<div class="modal-backdrop">
        <article class="modal" role="dialog" aria-modal="true" aria-label="Project brief">
          <div class="modal-intro">
            ${modalHead("Project brief", project.name, "Brief")}
          </div>
          <div class="modal-body markdown">${renderMarkdown(
            stripHeading(project.brief, [project.name]),
          )}</div>
          <div class="modal-foot">
            <span>${esc(project.brief_file || "PROJECT.md")}</span>
            <span class="read-only">read only</span>
          </div>
        </article>
      </div>`;
    } else {
      const links = linkRows(spec, project);
      root.innerHTML = `<div class="modal-backdrop">
        <article class="modal" role="dialog" aria-modal="true" aria-label="${esc(spec.title)}">
          <div class="modal-intro">
            ${modalHead(
              `${spec.id} · ${STATUS_LABEL[spec.status] || spec.status}`,
              spec.title,
              "Spec",
            )}
            <div class="modal-meta">${metaChips(spec)}</div>
            ${links}
          </div>
          <div class="modal-body markdown">${renderMarkdown(specBody(spec))}</div>
          <div class="modal-foot">
            <span>${esc(spec.file)}</span>
            <span class="read-only">read only</span>
          </div>
        </article>
      </div>`;
    }

    document.body.classList.add("modal-open");
    const body = document.querySelector(".modal-body");
    if (body && scrollTop) body.scrollTop = scrollTop;
  }

  function modalHead(eyebrow, title, label) {
    return `<header class="modal-head">
      <div class="modal-eyebrow">${esc(eyebrow)}</div>
      <h1 class="modal-title">${esc(title)}</h1>
      <button type="button" class="modal-close" data-close aria-label="Close ${esc(label)}">×</button>
    </header>`;
  }

  function metaChips(spec) {
    const chips = [
      `<span class="chip kind-${kindClass(spec.kind)}">${esc(spec.kind)}</span>`,
    ];
    if (spec.priority) chips.push(`<span class="chip">${esc(spec.priority)}</span>`);
    if (spec.milestone != null) {
      chips.push(`<span class="chip">milestone ${esc(spec.milestone)}</span>`);
    }
    chips.push(
      `<span class="chip status-${esc(spec.status)}">${esc(STATUS_LABEL[spec.status] || spec.status)}</span>`,
    );
    if (spec.blocked_reason) {
      chips.push(`<span class="chip chip-warn">blocked: ${esc(spec.blocked_reason)}</span>`);
    }
    if (spec.completed) {
      chips.push(`<span class="chip chip-done">completed ${esc(spec.completed)}</span>`);
    }
    if (spec.resolution) chips.push(`<span class="chip">${esc(spec.resolution)}</span>`);
    return chips.join("");
  }

  function linkRows(spec, project) {
    const rows = [];
    const addRow = (label, ids) => {
      if (!ids || !ids.length) return;
      const items = ids
        .map((id) => {
          const target = project.specs.find((item) => item.id === id);
          return target
            ? `<button type="button" class="chip dep" data-goto="${esc(id)}"><b>${esc(shortId(id))}</b>${esc(target.title)}</button>`
            : `<span class="chip dep missing" title="No spec with this id is on the board"><b>${esc(id)}</b>missing</span>`;
        })
        .join("");
      rows.push(
        `<div class="chip-row"><span class="chip-label">${esc(label)}</span>${items}</div>`,
      );
    };

    addRow("Depends on", spec.depends_on);
    addRow("Related", spec.related);
    if (spec.surfaces && spec.surfaces.length) {
      const items = spec.surfaces
        .map((surface) => `<span class="chip surface">${esc(surface)}</span>`)
        .join("");
      rows.push(
        `<div class="chip-row"><span class="chip-label">Surfaces</span>${items}</div>`,
      );
    }
    return rows.join("");
  }

  // ------------------------------------------------------------------ render

  function render() {
    renderHeader();
    if (!app.data) {
      $("main").className = "board-view";
      $("main").innerHTML = `<div class="empty">
        <h1>Board data missing</h1>
        <p>This page was not generated with a board. Run <code>couch-potator view</code> and open the file it writes.</p>
      </div>`;
      return;
    }
    if (app.view === "graph") renderGraph();
    else renderBoard();
    renderModal();
  }

  // ------------------------------------------------------------------ routes

  function readRoute() {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const projects = app.data?.projects || [];
    if (!projects.length) {
      app.projectSlug = null;
      app.specId = null;
      app.brief = false;
      return;
    }

    const wanted = params.get("project") || stored("board.project");
    app.projectSlug = projects.some((project) => project.slug === wanted)
      ? wanted
      : projects[0].slug;
    app.view = params.get("view") === "graph" ? "graph" : "board";

    const project = currentProject();
    app.milestone = chooseMilestone(
      project,
      params.get("milestone") ?? stored("board.milestone"),
    );

    const specId = params.get("spec");
    app.specId =
      specId && visibleSpecs(project).some((spec) => spec.id === specId) ? specId : null;
    app.brief = false;
    app.modalSig = "";
    app.graph.manual = false;
  }

  function writeRoute() {
    const params = new URLSearchParams();
    if (app.projectSlug) params.set("project", app.projectSlug);
    if (app.view === "graph") params.set("view", "graph");
    if (app.milestone != null) params.set("milestone", String(app.milestone));
    if (app.specId) params.set("spec", app.specId);

    const query = params.toString();
    const url = `${window.location.pathname}${query ? `#${query}` : ""}`;
    try {
      window.history.replaceState(null, "", url);
    } catch {
      if (window.location.hash !== (query ? `#${query}` : "")) {
        window.location.hash = query;
      }
    }

    if (app.projectSlug) {
      store("board.project", app.projectSlug);
      store("board.milestone", app.milestone == null ? "all" : String(app.milestone));
    }
  }

  function setView(view) {
    if (app.view === view) return;
    app.view = view;
    if (view === "graph") app.graph.manual = false;
    writeRoute();
    render();
  }

  function setProject(slug) {
    if (!slug || slug === app.projectSlug) return;
    app.projectSlug = slug;
    app.milestone = chooseMilestone(currentProject(), null);
    app.specId = null;
    app.brief = false;
    app.modalSig = "";
    app.graph.manual = false;
    writeRoute();
    render();
  }

  function setMilestone(value) {
    const next = value === "all" ? null : Number(value);
    if (next === app.milestone) return;

    app.milestone = next;
    const project = currentProject();
    if (app.specId && !visibleSpecs(project).some((spec) => spec.id === app.specId)) {
      app.specId = null;
      app.modalSig = "";
    }
    app.graph.manual = false;
    writeRoute();
    render();
  }

  function openSpec(id) {
    app.specId = id;
    app.brief = false;
    app.modalSig = "";
    writeRoute();
    renderModal(true);
  }

  function openBrief() {
    if (!currentProject()) return;
    app.brief = true;
    app.specId = null;
    app.modalSig = "";
    writeRoute();
    renderModal(true);
  }

  function closeModal() {
    app.specId = null;
    app.brief = false;
    app.modalSig = "";
    writeRoute();
    renderModal(true);
  }

  // ------------------------------------------------------------------ events

  function wireEvents() {
    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (target.closest("#reloadBtn")) {
        window.location.reload();
        return;
      }

      const goto = target.closest("[data-goto]");
      if (goto) {
        event.preventDefault();
        openSpec(goto.dataset.goto);
        return;
      }

      if (target.closest("[data-close]") || target.classList.contains("modal-backdrop")) {
        closeModal();
        return;
      }

      const viewButton = target.closest("[data-view]");
      if (viewButton) {
        setView(viewButton.dataset.view);
        return;
      }

      if (target.closest("#briefBtn")) {
        openBrief();
        return;
      }

      const card = target.closest("[data-spec]");
      if (card && !card.closest(".modal")) {
        openSpec(card.dataset.spec);
      }
    });

    document.addEventListener("change", (event) => {
      if (!(event.target instanceof HTMLSelectElement)) return;
      if (event.target.id === "projectSelect") {
        setProject(event.target.value);
      } else if (event.target.id === "milestoneSelect") {
        setMilestone(event.target.value);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && (app.specId || app.brief)) {
        closeModal();
      }
    });

    window.addEventListener("hashchange", () => {
      readRoute();
      render();
    });

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (app.view === "graph") {
          app.graph.manual = false;
          renderGraph();
        }
      }, 120);
    });
  }

  // -------------------------------------------------------------------- boot

  function boot() {
    configureMarkdown();
    wireEvents();
    loadData();
    readRoute();
    render();
    writeRoute();
  }

  boot();
})();
