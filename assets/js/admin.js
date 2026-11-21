/* ==========================================================================
   内容管理台 — 前端逻辑
   --------------------------------------------------------------------------
   · 密码只用于隐藏入口：静态站无法真正保护前端密码，真正的写权限由
     GitHub Token 控制。
   · 有 Token：通过 GitHub Contents API 提交 data/*.json。
   · 没 Token：在浏览器里编辑，导出 JSON 手动上传。
   ========================================================================== */

(function () {
  'use strict';

  /* ----------------------------------------------------------------------
     1. 常量与状态
     ---------------------------------------------------------------------- */
  // 管理密码的 SHA-256。修改密码时只替换这里的哈希，不要把明文写进仓库。
  const PASSWORD_HASH =
    'd6fc3f1690b9d22bbc936d2c0d536cb478d9f4bc987a1538dc28751e03856d4d';

  const DATA_FILES = {
    site: 'data/site.json',
    notes: 'data/notes.json',
    projects: 'data/projects.json',
    timeline: 'data/timeline.json',
    resources: 'data/resources.json'
  };

  const FILE_LABELS = {
    site: '站点资料',
    notes: '学习笔记',
    projects: '项目',
    timeline: '成长时间线',
    resources: '资源收藏'
  };

  const CONTENT = {
    notes: {
      file: 'notes',
      label: '学习笔记',
      singular: '笔记',
      eyebrow: 'Notes',
      desc: '只写思路和关键参数，完整正文与代码链到 GitHub。'
    },
    projects: {
      file: 'projects',
      label: '项目',
      singular: '项目',
      eyebrow: 'Projects',
      desc: '只放目标、方法和结果，完整代码与配置放在 GitHub。'
    },
    timeline: {
      file: 'timeline',
      label: '成长时间线',
      singular: '节点',
      eyebrow: 'Timeline',
      desc: '按月记录，公开页面会自动按年和季度分组。'
    },
    resources: {
      file: 'resources',
      label: '资源收藏',
      singular: '资源',
      eyebrow: 'Resources',
      desc: '数据库、工具、文献入口，按分类展示。'
    }
  };

  const LEVELS = ['在用', '会', '想学'];
  const STATUSES = ['进行中', '已完成', '持续维护'];
  const TIMELINE_TYPES = ['学习', '项目', '里程碑'];
  const CONTACT_ICONS = {
    mail: '邮箱',
    github: 'GitHub',
    globe: '网站',
    chat: '微信 / 聊天'
  };

  const SESSION_KEY = 'bio-admin-session';
  const CONFIG_KEY = 'bio-admin-config';
  const TOKEN_KEY = 'bio-admin-token';
  const GH_API = 'https://api.github.com';

  const state = {
    data: null,
    loaded: false,
    loading: false,
    error: null,
    tab: 'notes',
    selected: { notes: null, projects: null, timeline: null, resources: null },
    snapshots: {},
    config: loadConfig(),
    token: loadToken(),
    busy: false,
    statusTimer: null,
    toastTimer: null
  };

  /* ----------------------------------------------------------------------
     2. 工具函数
     ---------------------------------------------------------------------- */
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);

  let uidSeq = 0;
  function uid(prefix) {
    uidSeq += 1;
    return `${prefix}-${Date.now().toString(36)}${uidSeq.toString(36)}`;
  }

  const pad = (n) => String(n).padStart(2, '0');

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function todayMonth() {
    return todayISO().slice(0, 7);
  }

  function fmtDate(value) {
    const text = String(value == null ? '' : value).trim();
    return text ? text.slice(0, 10).replace(/-/g, '.') : '—';
  }

  function parseTags(value) {
    return [...new Set(
      String(value == null ? '' : value)
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )];
  }

  function splitLines(value) {
    return String(value == null ? '' : value)
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function clampScore(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function hostname(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (error) {
      return '';
    }
  }

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function cleanForJson(value) {
    return JSON.parse(
      JSON.stringify(value, (key, item) => (key.startsWith('__') ? undefined : item))
    );
  }

  function currentJson(file) {
    if (!state.data) return '';
    const source = file === 'site' ? state.data.site : state.data[file];
    return `${JSON.stringify(cleanForJson(source), null, 2)}\n`;
  }

  function dirtyFiles() {
    if (!state.data) return [];
    return Object.keys(DATA_FILES).filter(
      (file) => state.snapshots[file] !== undefined && currentJson(file) !== state.snapshots[file]
    );
  }

  function isHttpUrl(value) {
    return /^https?:\/\/[^\s]+$/i.test(String(value || '').trim());
  }

  function validHref(value) {
    const url = String(value || '').trim();
    if (!url) return true;
    if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) return true;
    return /^(?![a-z][a-z0-9+.-]*:)(?!\/\/)[\w./%#?=&-]+$/i.test(url);
  }

  function showToast(message, type = 'info', options = {}) {
    const toast = $('#toast');
    if (!toast) return;
    toast.className =
      'toast is-show' + (type === 'success' ? ' is-success' : type === 'error' ? ' is-error' : '');
    toast.innerHTML = `<span>${esc(message)}</span>${
      options.link
        ? `<a href="${esc(options.link)}" target="_blank" rel="noopener">${esc(options.linkText || '查看')} ↗</a>`
        : ''
    }`;
    clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-show');
    }, options.duration || (type === 'error' ? 6500 : 4200));
  }

  function showModal(dialog) {
    if (!dialog || dialog.open) return;
    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
        return true;
      } catch (fallbackError) {
        return false;
      }
    }
  }

  function downloadJson(file) {
    const text = currentJson(file);
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${file}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* ----------------------------------------------------------------------
     3. 配置与 Token
     ---------------------------------------------------------------------- */
  function defaultRepo() {
    const host = location.hostname;
    if (/\.github\.io$/i.test(host)) {
      return { owner: host.split('.')[0], repo: host, branch: 'main' };
    }
    return { owner: 'biolmz', repo: 'biolmz.github.io', branch: 'main' };
  }

  function loadConfig() {
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    } catch (error) {
      stored = {};
    }
    return {
      ...defaultRepo(),
      ...(stored && typeof stored === 'object' ? stored : {})
    };
  }

  function loadToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
    } catch (error) {
      return '';
    }
  }

  function saveConfig() {
    try {
      localStorage.setItem(
        CONFIG_KEY,
        JSON.stringify({
          owner: state.config.owner,
          repo: state.config.repo,
          branch: state.config.branch
        })
      );
    } catch (error) {
      /* 忽略隐私模式下的存储错误 */
    }
  }

  function persistToken(token, remember) {
    try {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
      if (token) {
        (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token);
      }
      return true;
    } catch (error) {
      return false;
    }
  }

  /* ----------------------------------------------------------------------
     4. 主题与登录
     ---------------------------------------------------------------------- */
  function syncThemeButton() {
    const toggle = $('#admin-theme');
    if (!toggle) return;
    const isLight = document.documentElement.dataset.theme === 'light';
    const label = isLight ? '切换为深色主题' : '切换为浅色主题';
    toggle.setAttribute('aria-label', label);
    toggle.setAttribute('title', label);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isLight ? '#f5f8fc' : '#070d17');
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('bio-theme', theme);
    } catch (error) {
      /* 忽略 */
    }
    syncThemeButton();
  }

  async function sha256(text) {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('浏览器不支持安全校验，请通过 localhost 或 https 打开。');
    }
    const buffer = await window.crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(text)
    );
    return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  function hasSession() {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch (error) {
      return false;
    }
  }

  function bindLogin() {
    const form = $('#login-form');
    const input = $('#admin-password');
    const error = $('#login-error');
    const submit = $('#login-submit');
    const card = $('#login-card');
    const toggle = $('#password-toggle');
    if (!form || !input || !submit) return;

    if (toggle) {
      toggle.addEventListener('click', () => {
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        toggle.textContent = showing ? '显示' : '隐藏';
        input.focus();
      });
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      error.hidden = true;
      if (!input.value) {
        error.textContent = '请输入密码。';
        error.hidden = false;
        return;
      }

      submit.disabled = true;
      submit.textContent = '校验中…';

      try {
        const hash = await sha256(input.value);
        if (hash === PASSWORD_HASH) {
          try {
            sessionStorage.setItem(SESSION_KEY, '1');
          } catch (storageError) {
            /* 忽略 */
          }
          input.value = '';
          enterDashboard();
        } else {
          error.textContent = '密码不对，再试一次。';
          error.hidden = false;
          if (card) {
            card.classList.remove('is-shake');
            void card.offsetWidth;
            card.classList.add('is-shake');
            window.setTimeout(() => card.classList.remove('is-shake'), 450);
          }
          await delay(300);
        }
      } catch (authError) {
        error.textContent = authError.message || '校验失败，请刷新后重试。';
        error.hidden = false;
      } finally {
        submit.disabled = false;
        submit.textContent = '进入管理台';
        input.focus();
      }
    });

    if (location.protocol === 'file:') {
      const note = $('#file-note');
      if (note) note.hidden = false;
    }
  }

  function enterDashboard() {
    const login = $('#login-view');
    const dashboard = $('#dashboard');
    const logout = $('#logout');
    if (login) login.hidden = true;
    if (dashboard) dashboard.hidden = false;
    if (logout) logout.hidden = false;
    syncThemeButton();

    const main = $('#admin-main');
    if (main) {
      try {
        main.focus({ preventScroll: true });
      } catch (error) {
        main.focus();
      }
    }

    if (state.loaded) {
      renderPanel();
      refreshStatus();
    } else if (!state.loading) {
      loadData();
    }
  }

  function logout() {
    if (
      state.loaded &&
      !state.busy &&
      dirtyFiles().length &&
      !window.confirm('有未提交的修改，退出会丢失，确定继续？')
    ) {
      return;
    }
    state.loaded = false;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {
      /* 忽略 */
    }
    window.location.reload();
  }

  /* ----------------------------------------------------------------------
     5. 数据加载
     ---------------------------------------------------------------------- */
  async function loadData() {
    if (state.loading) return;
    state.loading = true;
    state.error = null;
    renderLoading();
    refreshStatus();

    try {
      const entries = await Promise.all(
        Object.entries(DATA_FILES).map(async ([key, path]) => {
          const response = await fetch(path, { cache: 'no-cache' });
          if (!response.ok) {
            throw new Error(`${path} 请求失败（HTTP ${response.status}）`);
          }
          try {
            return [key, await response.json()];
          } catch (jsonError) {
            throw new Error(`${path} 不是合法的 JSON：${jsonError.message}`);
          }
        })
      );

      state.data = Object.fromEntries(entries);
      prepareData();
      state.snapshots = {};
      Object.keys(DATA_FILES).forEach((file) => {
        state.snapshots[file] = currentJson(file);
      });
      state.loaded = true;
      state.error = null;
      initSelection();
      updateCounts();
      renderPanel();
      refreshStatus();
    } catch (error) {
      state.error = error;
      state.loaded = false;
      renderLoadError(error);
      refreshStatus();
    } finally {
      state.loading = false;
    }
  }

  function prepareData() {
    const data = state.data;
    data.notes = data.notes || {};
    data.projects = data.projects || {};
    data.timeline = data.timeline || {};
    data.resources = data.resources || {};
    data.site = data.site || {};

    data.notes.items = data.notes.items || [];
    data.projects.items = data.projects.items || [];
    data.timeline.milestones = data.timeline.milestones || [];
    data.resources.groups = data.resources.groups || [];
    data.site.skills = data.site.skills || [];
    data.site.contact = data.site.contact || [];
    data.site.now = data.site.now || [];
    data.site.principles = data.site.principles || [];
    data.site.focus = data.site.focus || [];

    data.notes.items.forEach((item) => {
      if (!item.id) item.id = uid('note');
      item.__key = item.id;
    });
    data.projects.items.forEach((item) => {
      if (!item.id) item.id = uid('project');
      item.__key = item.id;
    });
    data.timeline.milestones.forEach((item) => {
      item.__key = uid('tl');
    });
    data.resources.groups.forEach((group) => {
      group.items = group.items || [];
      group.items.forEach((item) => {
        item.__key = uid('res');
      });
    });
  }

  function initSelection() {
    state.selected.notes = state.data.notes.items[0] ? state.data.notes.items[0].__key : null;
    state.selected.projects = state.data.projects.items[0] ? state.data.projects.items[0].__key : null;
    state.selected.timeline = state.data.timeline.milestones[0]
      ? state.data.timeline.milestones[0].__key
      : null;
    const firstResource = resourceEntries()[0];
    state.selected.resources = firstResource ? firstResource.item.__key : null;
  }

  function renderLoading() {
    const panel = $('#admin-panel');
    if (!panel) return;
    panel.innerHTML = `<div class="admin-loading">
      <span class="spinner" aria-hidden="true"></span>
      <span>正在读取 data/*.json…</span>
    </div>`;
  }

  function renderLoadError(error) {
    const panel = $('#admin-panel');
    if (!panel) return;
    const isFile = location.protocol === 'file:';
    panel.innerHTML = `<div class="admin-loaderror">
      <p class="eyebrow">Loading failed</p>
      <h2>data/*.json 没读出来</h2>
      <p>${esc(error && error.message ? error.message : '未知错误')}</p>
      ${
        isFile
          ? `<p>浏览器不允许 <code>file://</code> 页面读取 JSON。请在网站根目录启动本地服务器：</p>
             <pre>python -m http.server 8000</pre>
             <p>然后访问 <code>http://localhost:8000/admin.html</code>。</p>`
          : `<p>检查 <code>data/</code> 目录是否上传完整、文件名是否为小写、JSON 语法是否正确。也可以运行 <code>python check_data.py</code> 定位错误。</p>`
      }
      <div class="error-actions">
        <button class="btn btn-primary btn-sm" type="button" data-action="retry">重试</button>
        <a class="btn btn-ghost btn-sm" href="index.html">查看网站</a>
      </div>
    </div>`;
  }

  /* ----------------------------------------------------------------------
     6. 选择状态与列表
     ---------------------------------------------------------------------- */
  function contentItems(type) {
    if (!state.data) return [];
    if (type === 'notes') return state.data.notes.items;
    if (type === 'projects') return state.data.projects.items;
    if (type === 'timeline') return state.data.timeline.milestones;
    return [];
  }

  function resourceEntries() {
    if (!state.data) return [];
    return state.data.resources.groups.flatMap((group) =>
      (group.items || []).map((item) => ({ group, item }))
    );
  }

  function findResource(key) {
    return resourceEntries().find((entry) => entry.item.__key === key) || null;
  }

  function selectedContent() {
    if (!state.data) return null;
    if (state.tab === 'resources') {
      const entry = findResource(state.selected.resources);
      return entry ? entry.item : null;
    }
    return contentItems(state.tab).find((item) => item.__key === state.selected[state.tab]) || null;
  }

  function ensureSelection(type) {
    const items = type === 'resources' ? resourceEntries().map((entry) => entry.item) : contentItems(type);
    const exists = items.some((item) => item.__key === state.selected[type]);
    if (!exists) {
      state.selected[type] = items[0] ? items[0].__key : null;
    }
    return state.selected[type];
  }

  function itemTitle(type, item) {
    return (type === 'resources' ? item.name : item.title) || '未命名';
  }

  function itemMeta(type, item) {
    if (type === 'resources') {
      const entry = resourceEntries().find((entryItem) => entryItem.item === item);
      const category = entry ? entry.group.category : '';
      const host = hostname(item.url);
      return [category, host || '未设置链接'].filter(Boolean).join(' · ');
    }
    if (type === 'projects') {
      return [fmtDate(item.date), item.status || '已完成'].filter(Boolean).join(' · ');
    }
    if (type === 'timeline') {
      return [fmtDate(item.date), item.type || '学习'].filter(Boolean).join(' · ');
    }
    return fmtDate(item.date);
  }

  function rowHtml(type, item, active) {
    return `<button class="item-row${active ? ' is-active' : ''}" type="button" data-key="${esc(item.__key)}">
      <span class="item-row-main">
        <span class="item-row-title">${esc(itemTitle(type, item))}</span>
        <span class="item-row-meta">${esc(itemMeta(type, item))}</span>
      </span>
      <span class="item-row-arrow" aria-hidden="true">›</span>
    </button>`;
  }

  /* ----------------------------------------------------------------------
     7. 面板渲染
     ---------------------------------------------------------------------- */
  function setTab(tab) {
    state.tab = tab;
    $$('.admin-tab').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.tab === tab);
    });
    renderPanel();
  }

  function renderPanel() {
    if (!state.loaded) {
      if (state.loading) renderLoading();
      else if (state.error) renderLoadError(state.error);
      else renderLoading();
      return;
    }

    if (state.tab === 'profile') {
      renderProfile();
    } else if (state.tab === 'skills') {
      renderSkills();
    } else {
      renderContentPanel(state.tab);
    }
    refreshStatus();
  }

  function renderContentPanel(type) {
    const panel = $('#admin-panel');
    const meta = CONTENT[type];
    if (!panel || !meta) return;

    ensureSelection(type);
    const items = type === 'resources' ? resourceEntries().map((entry) => entry.item) : contentItems(type);
    const selectedKey = state.selected[type];
    const rows = items.map((item) => rowHtml(type, item, item.__key === selectedKey)).join('');

    panel.innerHTML = `<div class="panel-head">
      <div>
        <p class="eyebrow">${esc(meta.eyebrow)}</p>
        <h2>${esc(meta.label)}</h2>
        <p>${esc(meta.desc)} 当前 ${items.length} 项。</p>
      </div>
      <div class="panel-head-actions">
        ${
          type === 'resources'
            ? '<button class="btn btn-ghost btn-sm" type="button" data-action="add-resource-group">＋ 分类</button>'
            : ''
        }
        <button class="btn btn-primary btn-sm" type="button" data-action="new-content" data-type="${type}">
          ＋ 新建${esc(meta.singular)}
        </button>
      </div>
    </div>
    <div class="editor-layout">
      <div class="item-list">${rows || `<p class="list-empty">还没有${esc(meta.singular)}</p>`}</div>
      <div class="editor-pane">${editorHtml(type)}</div>
    </div>`;
  }

  function editorHtml(type) {
    const item = selectedContent();
    if (!item) {
      return `<div class="editor-empty">
        <span class="big" aria-hidden="true">＋</span>
        <p>还没有选中${esc(CONTENT[type].singular)}。<br>点击「新建${esc(CONTENT[type].singular)}」开始。</p>
      </div>`;
    }

    if (type === 'notes') return noteEditor(item);
    if (type === 'projects') return projectEditor(item);
    if (type === 'timeline') return timelineEditor(item);
    if (type === 'resources') {
      const entry = findResource(item.__key);
      return resourceEditor(item, entry);
    }
    return '';
  }

  /* ----------------------------------------------------------------------
     8. 表单片段
     ---------------------------------------------------------------------- */
  function fieldHtml(label, control, options = {}) {
    return `<label class="field">
      <span class="field-label">${esc(label)}${options.required ? '<em>*</em>' : ''}</span>
      ${control}
      ${options.hint ? `<small>${esc(options.hint)}</small>` : ''}
    </label>`;
  }

  function cInput(name, value, options = {}) {
    const type = options.type || 'text';
    return `<input type="${type}" data-content-field="${name}" value="${esc(
      value == null ? '' : value
    )}" placeholder="${esc(options.placeholder || '')}"${
      options.required ? ' required' : ''
    }${options.min != null ? ` min="${options.min}"` : ''}${
      options.max != null ? ` max="${options.max}"` : ''
    }>`;
  }

  function cTextarea(name, value, placeholder = '') {
    return `<textarea data-content-field="${name}" rows="4" placeholder="${esc(
      placeholder
    )}">${esc(value == null ? '' : value)}</textarea>`;
  }

  function cSelect(name, value, values) {
    return `<select data-content-field="${name}">${values
      .map(
        (item) =>
          `<option value="${esc(item)}"${item === value ? ' selected' : ''}>${esc(item)}</option>`
      )
      .join('')}</select>`;
  }

  function sInput(name, value, options = {}) {
    const type = options.type || 'text';
    return `<input type="${type}" data-site-field="${name}" value="${esc(
      value == null ? '' : value
    )}" placeholder="${esc(options.placeholder || '')}"${
      options.required ? ' required' : ''
    }>`;
  }

  function sTextarea(name, value, placeholder = '') {
    return `<textarea data-site-field="${name}" rows="4" placeholder="${esc(
      placeholder
    )}">${esc(value == null ? '' : value)}</textarea>`;
  }

  function repeatField(label, control) {
    return `<label class="field"><span class="field-label">${esc(label)}</span>${control}</label>`;
  }

  /* ----------------------------------------------------------------------
     9. 四种内容编辑器
     ---------------------------------------------------------------------- */
  function noteEditor(item) {
    return `<form class="editor-form" novalidate>
      <div class="form-head">
        <div>
          <p class="eyebrow">Note</p>
          <h3>${esc(item.title || '新建笔记')}</h3>
          <p class="form-sub">${fmtDate(item.date)} · ${(item.tags || []).length} 个标签</p>
        </div>
        <button class="btn btn-danger-ghost btn-sm" type="button" data-action="delete-content">删除</button>
      </div>

      ${fieldHtml('标题', cInput('title', item.title, { placeholder: '这篇笔记解决什么问题？', required: true }), { required: true })}
      <div class="field-row">
        ${fieldHtml('日期', cInput('date', item.date, { type: 'date', required: true }), { required: true })}
        ${fieldHtml('阅读时长', cInput('readTime', item.readTime, { placeholder: '约 15 分钟' }))}
      </div>
      ${fieldHtml('标签', cInput('tags', (item.tags || []).join(', '), { placeholder: 'RNA-seq, STAR, Linux' }), { hint: '用逗号分隔，列表页会自动生成筛选按钮。' })}
      ${fieldHtml('摘要', cTextarea('summary', item.summary, '两三句话写清思路、关键参数和结论。'), { hint: '正文只放思路，完整命令和代码链到 GitHub。' })}
      <div class="field-row">
        ${fieldHtml('笔记全文链接', cInput('url', item.url, { type: 'url', placeholder: 'https://github.com/...' }))}
        ${fieldHtml('代码仓库链接', cInput('repo', item.repo, { type: 'url', placeholder: 'https://github.com/...' }))}
      </div>

      <div class="editor-actions">
        <button class="btn btn-ghost" type="button" data-action="save">提交更改</button>
      </div>
    </form>`;
  }

  function projectEditor(item) {
    return `<form class="editor-form" novalidate>
      <div class="form-head">
        <div>
          <p class="eyebrow">Project</p>
          <h3>${esc(item.title || '新建项目')}</h3>
          <p class="form-sub">${fmtDate(item.date)} · ${esc(item.status || '进行中')}</p>
        </div>
        <button class="btn btn-danger-ghost btn-sm" type="button" data-action="delete-content">删除</button>
      </div>

      ${fieldHtml('项目名称', cInput('title', item.title, { placeholder: '项目解决什么问题？', required: true }), { required: true })}
      <div class="field-row">
        ${fieldHtml('日期', cInput('date', item.date, { type: 'month', required: true }), { required: true, hint: '格式 YYYY-MM' })}
        ${fieldHtml('状态', cSelect('status', item.status || '进行中', STATUSES))}
      </div>
      ${fieldHtml('标签 / 技术栈', cInput('tags', (item.tags || []).join(', '), { placeholder: 'Snakemake, Python, Docker' }), { hint: '用逗号分隔。' })}
      ${fieldHtml('项目摘要', cTextarea('summary', item.summary, '目标是什么、用了什么方法、现在做到哪一步。'))}
      ${fieldHtml('亮点', cTextarea('highlights', (item.highlights || []).join('\n'), '每行一条，例如：支持双端与单端测序'), { hint: '每行一条，会显示在项目卡片里。' })}
      <div class="field-row">
        ${fieldHtml('仓库链接', cInput('repo', item.repo, { type: 'url', placeholder: 'https://github.com/...' }))}
        ${fieldHtml('演示链接', cInput('demo', item.demo, { type: 'url', placeholder: 'https://...' }))}
      </div>
      <label class="check">
        <input type="checkbox" data-content-field="featured" ${item.featured ? 'checked' : ''}>
        在首页「精选项目」中优先展示
      </label>

      <div class="editor-actions">
        <button class="btn btn-ghost" type="button" data-action="save">提交更改</button>
      </div>
    </form>`;
  }

  function timelineEditor(item) {
    return `<form class="editor-form" novalidate>
      <div class="form-head">
        <div>
          <p class="eyebrow">Milestone</p>
          <h3>${esc(item.title || '新建节点')}</h3>
          <p class="form-sub">${fmtDate(item.date)} · ${esc(item.type || '学习')}</p>
        </div>
        <button class="btn btn-danger-ghost btn-sm" type="button" data-action="delete-content">删除</button>
      </div>

      <div class="field-row">
        ${fieldHtml('月份', cInput('date', item.date, { type: 'month', required: true }), { required: true, hint: '格式 YYYY-MM' })}
        ${fieldHtml('类型', cSelect('type', item.type || '学习', TIMELINE_TYPES))}
      </div>
      ${fieldHtml('标题', cInput('title', item.title, { placeholder: '这个月完成了什么？', required: true }), { required: true })}
      ${fieldHtml('详情', cTextarea('detail', item.detail, '一两句话写清成果、卡点或下一步。'))}
      ${fieldHtml('相关链接', cInput('link', item.link, { type: 'url', placeholder: 'https://...' }), { hint: '可选，会显示「相关记录」。' })}

      <div class="editor-actions">
        <button class="btn btn-ghost" type="button" data-action="save">提交更改</button>
      </div>
    </form>`;
  }

  function resourceEditor(item, entry) {
    const categories = state.data.resources.groups.map((group) => group.category);
    const currentCategory = entry ? entry.group.category : categories[0] || '';
    const options = categories
      .map(
        (category) =>
          `<option value="${esc(category)}"${category === currentCategory ? ' selected' : ''}>${esc(category)}</option>`
      )
      .join('');

    return `<form class="editor-form" novalidate>
      <div class="form-head">
        <div>
          <p class="eyebrow">Resource</p>
          <h3>${esc(item.name || '新建资源')}</h3>
          <p class="form-sub">${esc(currentCategory || '未分类')} · ${esc(hostname(item.url) || '未设置链接')}</p>
        </div>
        <button class="btn btn-danger-ghost btn-sm" type="button" data-action="delete-content">删除</button>
      </div>

      ${fieldHtml('分类', `<select data-resource-category>${options}<option value="__new__">＋ 新建分类…</option></select>`, { hint: '切换分类会把这条资源移动到对应分组。' })}
      ${fieldHtml('名称', cInput('name', item.name, { placeholder: 'NCBI / Bioconda / PubMed', required: true }), { required: true })}
      ${fieldHtml('说明', cTextarea('desc', item.desc, '一句话说明这个资源是做什么的、什么时候会用到。'))}
      ${fieldHtml('链接', cInput('url', item.url, { type: 'url', placeholder: 'https://...', required: true }), { required: true })}

      <div class="editor-actions">
        <button class="btn btn-ghost" type="button" data-action="save">提交更改</button>
      </div>
    </form>`;
  }

  /* ----------------------------------------------------------------------
     10. 站点资料编辑器
     ---------------------------------------------------------------------- */
  function renderProfile() {
    const panel = $('#admin-panel');
    const site = state.data.site;
    if (!panel) return;

    const contacts = (site.contact || [])
      .map((contact, index) => contactEditor(contact, index))
      .join('');
    const nowItems = (site.now || []).map((item, index) => nowEditor(item, index)).join('');
    const principles = (site.principles || [])
      .map((item, index) => principleEditor(item, index))
      .join('');

    panel.innerHTML = `<div class="panel-head">
      <div>
        <p class="eyebrow">Profile</p>
        <h2>站点资料</h2>
        <p>姓名、定位、联系方式、首页的「最近在做什么」和分析原则。</p>
      </div>
      <span class="group-count">site.json</span>
    </div>
    <div class="editor-pane">
      <form class="editor-form" novalidate>
        <section class="form-section">
          <div class="form-section-head">
            <div>
              <h3>基本信息</h3>
              <p>首页和「关于我」页会使用这些内容。</p>
            </div>
          </div>
          <div class="field-row">
            ${fieldHtml('姓名', sInput('name', site.name, { required: true }), { required: true })}
            ${fieldHtml('身份', sInput('role', site.role, { placeholder: '生物信息学学习者' }))}
          </div>
          ${fieldHtml('一句话定位', sInput('positioning', site.positioning, { placeholder: '把测序数据，变成能复现的结论' }), { hint: '首页大标题会把逗号后的部分做成强调色。' })}
          ${fieldHtml('简介', sTextarea('intro', site.intro, '两三句话介绍你在做什么。'))}
          ${fieldHtml('关注方向', sInput('focus', (site.focus || []).join(', '), { placeholder: '转录组分析, 变异检测, 可复现流程' }), { hint: '用逗号分隔，显示为标签。' })}
          ${fieldHtml('最后更新', sInput('updated', site.updated, { type: 'date' }))}
        </section>

        <section class="form-section">
          <div class="form-section-head">
            <div>
              <h3>联系方式</h3>
              <p>显示在「关于我」页和首页底部。</p>
            </div>
            <button class="mini-btn" type="button" data-action="add-contact">＋ 联系方式</button>
          </div>
          <div class="repeat-list">${contacts || '<p class="field-hint">还没有联系方式。</p>'}</div>
        </section>

        <section class="form-section">
          <div class="form-section-head">
            <div>
              <h3>最近在做什么</h3>
              <p>首页「关于我」的 now 列表。</p>
            </div>
            <button class="mini-btn" type="button" data-action="add-now">＋ 一条</button>
          </div>
          <div class="repeat-list">${nowItems || '<p class="field-hint">还没有条目。</p>'}</div>
        </section>

        <section class="form-section">
          <div class="form-section-head">
            <div>
              <h3>分析原则</h3>
              <p>「关于我」页底部的三条卡片。</p>
            </div>
            <button class="mini-btn" type="button" data-action="add-principle">＋ 一条</button>
          </div>
          <div class="repeat-list">${principles || '<p class="field-hint">还没有条目。</p>'}</div>
        </section>

        <div class="editor-actions">
          <button class="btn btn-ghost" type="button" data-action="save">提交更改</button>
        </div>
      </form>
    </div>`;
    refreshStatus();
  }

  function contactEditor(contact, index) {
    const iconOptions = Object.entries(CONTACT_ICONS)
      .map(
        ([value, label]) =>
          `<option value="${value}"${contact.icon === value ? ' selected' : ''}>${label}</option>`
      )
      .join('');

    return `<div class="repeat-item">
      <div class="repeat-head">
        <select data-contact-field="icon" data-index="${index}" aria-label="联系方式图标">${iconOptions}</select>
        <input class="grow" data-contact-field="label" data-index="${index}" value="${esc(
          contact.label || ''
        )}" placeholder="标签（邮箱 / GitHub）" aria-label="联系方式标签">
        <button class="icon-danger" type="button" data-action="delete-contact" data-index="${index}" aria-label="删除联系方式">×</button>
      </div>
      <div class="repeat-grid">
        <label class="field"><span class="field-label">显示文本</span><input data-contact-field="value" data-index="${index}" value="${esc(contact.value || '')}" placeholder="qflmz2007@163.com"></label>
        <label class="field"><span class="field-label">链接</span><input data-contact-field="href" data-index="${index}" value="${esc(contact.href || '')}" placeholder="mailto:... / https://..."></label>
        <label class="field span-2"><span class="field-label">提示文字</span><input data-contact-field="hint" data-index="${index}" value="${esc(contact.hint || '')}" placeholder="例如：加好友请备注来意"></label>
        <label class="check span-2"><input type="checkbox" data-contact-field="copy" data-index="${index}" ${contact.copy ? 'checked' : ''}> 显示复制按钮</label>
      </div>
    </div>`;
  }

  function nowEditor(item, index) {
    return `<div class="repeat-item">
      <div class="repeat-head">
        <input class="grow" data-now-field="label" data-index="${index}" value="${esc(
          item.label || ''
        )}" placeholder="标签（主线 / 补基础 / 输出）" aria-label="标签">
        <button class="icon-danger" type="button" data-action="delete-now" data-index="${index}" aria-label="删除条目">×</button>
      </div>
      <label class="field"><span class="field-label">内容</span><textarea data-now-field="text" data-index="${index}" rows="3" placeholder="最近在推进什么？">${esc(
        item.text || ''
      )}</textarea></label>
    </div>`;
  }

  function principleEditor(item, index) {
    return `<div class="repeat-item">
      <div class="repeat-head">
        <input class="grow" data-principle-field="title" data-index="${index}" value="${esc(
          item.title || ''
        )}" placeholder="原则标题" aria-label="原则标题">
        <button class="icon-danger" type="button" data-action="delete-principle" data-index="${index}" aria-label="删除原则">×</button>
      </div>
      <label class="field"><span class="field-label">说明</span><textarea data-principle-field="text" data-index="${index}" rows="3" placeholder="具体怎么做？">${esc(
        item.text || ''
      )}</textarea></label>
    </div>`;
  }

  /* ----------------------------------------------------------------------
     11. 技能矩阵编辑器
     ---------------------------------------------------------------------- */
  function renderSkills() {
    const panel = $('#admin-panel');
    const site = state.data.site;
    if (!panel) return;

    const groups = site.skills || [];
    const total = groups.reduce((sum, group) => sum + (group.items || []).length, 0);

    const groupHtml = groups
      .map((group, groupIndex) => {
        const items = (group.items || []).map((item, itemIndex) => skillRow(item, groupIndex, itemIndex)).join('');
        return `<section class="skill-group-card">
          <div class="skill-group-head">
            <input data-skill-group="${groupIndex}" value="${esc(group.group || '')}" aria-label="分组名称" placeholder="分组名称">
            <span class="group-count">${(group.items || []).length} 项</span>
            <button class="mini-btn" type="button" data-action="add-skill-item" data-gi="${groupIndex}">＋ 工具</button>
            <button class="mini-btn" type="button" data-action="delete-skill-group" data-gi="${groupIndex}">删除分组</button>
          </div>
          <div class="skill-edit-list">${items || '<p class="skill-empty">这个分组还没有工具。</p>'}</div>
        </section>`;
      })
      .join('');

    panel.innerHTML = `<div class="panel-head">
      <div>
        <p class="eyebrow">Skills</p>
        <h2>技能矩阵</h2>
        <p>${groups.length} 个分组、${total} 项工具。首页展示前 6 项，完整矩阵在「关于我」。</p>
      </div>
      <button class="btn btn-primary btn-sm" type="button" data-action="add-skill-group">＋ 分组</button>
    </div>
    <div class="editor-pane">
      <div class="skill-editor-list">
        ${groupHtml || '<p class="field-hint">还没有技能分组。</p>'}
      </div>
      <p class="field-hint" style="margin-top:16px">「在用」表示日常持续使用，「会」表示能跑通、能改，「想学」表示已列入计划。</p>
      <div class="editor-actions">
        <button class="btn btn-ghost" type="button" data-action="save">提交更改</button>
      </div>
    </div>`;
    refreshStatus();
  }

  function skillRow(item, groupIndex, itemIndex) {
    const levelOptions = LEVELS.map(
      (level) => `<option value="${level}"${item.level === level ? ' selected' : ''}>${level}</option>`
    ).join('');

    return `<div class="skill-edit-row">
      <input data-skill-field="name" data-gi="${groupIndex}" data-ii="${itemIndex}" value="${esc(
        item.name || ''
      )}" placeholder="工具 / 方向" aria-label="工具名称">
      <select data-skill-field="level" data-gi="${groupIndex}" data-ii="${itemIndex}" aria-label="熟练度状态">${levelOptions}</select>
      <input type="number" min="0" max="100" data-skill-field="score" data-gi="${groupIndex}" data-ii="${itemIndex}" value="${clampScore(
        item.score
      )}" aria-label="自评分数">
      <input data-skill-field="note" data-gi="${groupIndex}" data-ii="${itemIndex}" value="${esc(
        item.note || ''
      )}" placeholder="具体能力说明" aria-label="说明">
      <button class="icon-danger" type="button" data-action="delete-skill-item" data-gi="${groupIndex}" data-ii="${itemIndex}" aria-label="删除技能">×</button>
    </div>`;
  }

  /* ----------------------------------------------------------------------
     12. 表单事件
     ---------------------------------------------------------------------- */
  function bindPanel() {
    const panel = $('#admin-panel');
    if (!panel) return;

    panel.addEventListener('submit', (event) => event.preventDefault());
    panel.addEventListener('input', onPanelInput);
    panel.addEventListener('change', onPanelInput);
    panel.addEventListener('click', onPanelClick);
  }

  function onPanelInput(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const isSelect = target.tagName === 'SELECT';
    const isCheckbox = target.type === 'checkbox';
    if (isSelect || isCheckbox) {
      if (event.type !== 'change') return;
    } else if (event.type !== 'input') {
      return;
    }

    if (target.matches('[data-resource-category]')) {
      handleResourceCategoryChange(target.value);
      return;
    }

    if (target.matches('[data-content-field]')) {
      const item = selectedContent();
      if (!item) return;
      const field = target.dataset.contentField;
      if (field === 'featured') {
        item.featured = target.checked;
      } else if (field === 'tags') {
        item.tags = parseTags(target.value);
      } else if (field === 'highlights') {
        item.highlights = splitLines(target.value);
      } else {
        item[field] = target.value;
      }
      scheduleUiSync();
      return;
    }

    if (target.matches('[data-site-field]')) {
      const field = target.dataset.siteField;
      const site = state.data.site;
      site[field] = field === 'focus' ? parseTags(target.value) : target.value;
      scheduleUiSync();
      return;
    }

    if (target.matches('[data-contact-field]')) {
      const index = Number(target.dataset.index);
      const contact = state.data.site.contact[index];
      if (!contact) return;
      const field = target.dataset.contactField;
      contact[field] = field === 'copy' ? target.checked : target.value;
      scheduleUiSync();
      return;
    }

    if (target.matches('[data-now-field]')) {
      const index = Number(target.dataset.index);
      const item = state.data.site.now[index];
      if (!item) return;
      item[target.dataset.nowField] = target.value;
      scheduleUiSync();
      return;
    }

    if (target.matches('[data-principle-field]')) {
      const index = Number(target.dataset.index);
      const item = state.data.site.principles[index];
      if (!item) return;
      item[target.dataset.principleField] = target.value;
      scheduleUiSync();
      return;
    }

    if (target.matches('[data-skill-group]')) {
      const group = state.data.site.skills[Number(target.dataset.skillGroup)];
      if (!group) return;
      group.group = target.value;
      scheduleUiSync();
      return;
    }

    if (target.matches('[data-skill-field]')) {
      const gi = Number(target.dataset.gi);
      const ii = Number(target.dataset.ii);
      const item = state.data.site.skills[gi] && state.data.site.skills[gi].items[ii];
      if (!item) return;
      const field = target.dataset.skillField;
      item[field] = field === 'score' ? clampScore(target.value) : target.value;
      scheduleUiSync();
    }
  }

  function onPanelClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const actionEl = target.closest('[data-action]');
    const action = actionEl ? actionEl.dataset.action : '';

    if (action) {
      event.preventDefault();
      switch (action) {
        case 'new-content':
          createContent(actionEl.dataset.type || state.tab);
          return;
        case 'delete-content':
          deleteSelectedContent();
          return;
        case 'save':
          saveAll();
          return;
        case 'retry':
          loadData();
          return;
        case 'add-resource-group':
          addResourceGroup();
          return;
        case 'add-contact':
          addContact();
          return;
        case 'delete-contact':
          deleteContact(Number(actionEl.dataset.index));
          return;
        case 'add-now':
          addNow();
          return;
        case 'delete-now':
          deleteNow(Number(actionEl.dataset.index));
          return;
        case 'add-principle':
          addPrinciple();
          return;
        case 'delete-principle':
          deletePrinciple(Number(actionEl.dataset.index));
          return;
        case 'add-skill-group':
          addSkillGroup();
          return;
        case 'delete-skill-group':
          deleteSkillGroup(Number(actionEl.dataset.gi));
          return;
        case 'add-skill-item':
          addSkillItem(Number(actionEl.dataset.gi));
          return;
        case 'delete-skill-item':
          deleteSkillItem(Number(actionEl.dataset.gi), Number(actionEl.dataset.ii));
          return;
        default:
          return;
      }
    }

    const row = target.closest('.item-row');
    if (row && !['profile', 'skills'].includes(state.tab)) {
      state.selected[state.tab] = row.dataset.key;
      renderPanel();
    }
  }

  function scheduleUiSync() {
    clearTimeout(state.statusTimer);
    state.statusTimer = window.setTimeout(() => {
      updateSelectedRow();
      refreshStatus();
    }, 180);
  }

  function updateSelectedRow() {
    if (!['notes', 'projects', 'timeline', 'resources'].includes(state.tab)) return;
    const item = selectedContent();
    if (!item) return;

    const row = $$('.item-row').find((element) => element.dataset.key === item.__key);
    if (row) {
      const title = row.querySelector('.item-row-title');
      const meta = row.querySelector('.item-row-meta');
      if (title) title.textContent = itemTitle(state.tab, item);
      if (meta) meta.textContent = itemMeta(state.tab, item);
    }

    const heading = $('.form-head h3');
    if (heading) heading.textContent = itemTitle(state.tab, item);
    const sub = $('.form-sub');
    if (sub) {
      if (state.tab === 'resources') {
        const entry = findResource(item.__key);
        sub.textContent = `${entry ? entry.group.category : '未分类'} · ${hostname(item.url) || '未设置链接'}`;
      } else if (state.tab === 'projects') {
        sub.textContent = `${fmtDate(item.date)} · ${item.status || '进行中'}`;
      } else if (state.tab === 'timeline') {
        sub.textContent = `${fmtDate(item.date)} · ${item.type || '学习'}`;
      } else {
        sub.textContent = `${fmtDate(item.date)} · ${(item.tags || []).length} 个标签`;
      }
    }
  }

  /* ----------------------------------------------------------------------
     13. 新增 / 删除
     ---------------------------------------------------------------------- */
  function createContent(type) {
    if (!state.data) return;

    if (type === 'notes') {
      const item = {
        id: uid('note'),
        title: '未命名笔记',
        date: todayISO(),
        tags: [],
        summary: '',
        url: '',
        repo: '',
        readTime: ''
      };
      item.__key = item.id;
      state.data.notes.items.unshift(item);
      state.selected.notes = item.__key;
    } else if (type === 'projects') {
      const item = {
        id: uid('project'),
        title: '未命名项目',
        date: todayMonth(),
        status: '进行中',
        tags: [],
        summary: '',
        highlights: [],
        repo: '',
        demo: '',
        featured: false
      };
      item.__key = item.id;
      state.data.projects.items.unshift(item);
      state.selected.projects = item.__key;
    } else if (type === 'timeline') {
      const item = {
        date: todayMonth(),
        type: '学习',
        title: '新的节点',
        detail: '',
        link: ''
      };
      item.__key = uid('tl');
      state.data.timeline.milestones.unshift(item);
      state.selected.timeline = item.__key;
    } else if (type === 'resources') {
      const groups = state.data.resources.groups;
      if (!groups.length) groups.push({ category: '未分类', items: [] });
      const selected = findResource(state.selected.resources);
      const group = selected ? selected.group : groups[0];
      const item = { name: '未命名资源', desc: '', url: '' };
      item.__key = uid('res');
      group.items.push(item);
      state.selected.resources = item.__key;
    } else {
      return;
    }

    state.tab = type;
    $$('.admin-tab').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.tab === type);
    });
    updateCounts();
    renderPanel();
    focusEditorTitle();
  }

  function focusEditorTitle() {
    window.requestAnimationFrame(() => {
      const input = $(
        '#admin-panel [data-content-field="title"], #admin-panel [data-content-field="name"]'
      );
      if (input) {
        input.focus();
        if (typeof input.select === 'function') input.select();
      }
    });
  }

  function deleteSelectedContent() {
    const type = state.tab;
    const item = selectedContent();
    if (!item) return;

    const name = itemTitle(type, item);
    if (!window.confirm(`确定删除「${name}」吗？提交后生效。`)) return;

    if (type === 'notes') {
      removeContentItem(state.data.notes.items, item);
    } else if (type === 'projects') {
      removeContentItem(state.data.projects.items, item);
    } else if (type === 'timeline') {
      removeContentItem(state.data.timeline.milestones, item);
    } else if (type === 'resources') {
      const entry = findResource(item.__key);
      if (entry) {
        const list = entry.group.items;
        const index = list.indexOf(item);
        list.splice(index, 1);
        const next = resourceEntries()[0];
        state.selected.resources = next ? next.item.__key : null;
      }
    }

    updateCounts();
    renderPanel();
  }

  function removeContentItem(list, item) {
    const type = state.tab;
    const index = list.indexOf(item);
    if (index < 0) return;
    list.splice(index, 1);
    const next = list[Math.min(index, list.length - 1)];
    state.selected[type] = next ? next.__key : null;
  }

  function addResourceGroup() {
    const name = window.prompt('新分类名称', '新分类');
    if (!name || !name.trim()) return;
    const category = name.trim();
    const groups = state.data.resources.groups;
    if (groups.some((group) => group.category === category)) {
      showToast('这个分类已经存在。', 'error');
      return;
    }
    groups.push({ category, items: [] });
    updateCounts();
    renderPanel();
    showToast(`已新增分类「${category}」，可以往里添加资源了。`, 'success');
  }

  function handleResourceCategoryChange(value) {
    const entry = findResource(state.selected.resources);
    if (!entry) return;
    const groups = state.data.resources.groups;

    let category = value;
    if (category === '__new__') {
      const name = window.prompt('新分类名称', '新分类');
      if (!name || !name.trim()) {
        renderPanel();
        return;
      }
      category = name.trim();
      if (!groups.some((group) => group.category === category)) {
        groups.push({ category, items: [] });
      }
    }

    if (category === entry.group.category) {
      renderPanel();
      return;
    }

    const targetGroup = groups.find((group) => group.category === category);
    if (!targetGroup) {
      renderPanel();
      return;
    }

    const list = entry.group.items;
    list.splice(list.indexOf(entry.item), 1);
    targetGroup.items.push(entry.item);
    updateCounts();
    renderPanel();
  }

  function addContact() {
    state.data.site.contact.push({
      label: '新联系方式',
      value: '',
      href: '',
      icon: 'globe',
      hint: ''
    });
    renderProfile();
  }

  function deleteContact(index) {
    if (!window.confirm('删除这条联系方式？')) return;
    state.data.site.contact.splice(index, 1);
    renderProfile();
  }

  function addNow() {
    state.data.site.now.push({ label: '', text: '' });
    renderProfile();
  }

  function deleteNow(index) {
    if (!window.confirm('删除这条「最近在做什么」？')) return;
    state.data.site.now.splice(index, 1);
    renderProfile();
  }

  function addPrinciple() {
    state.data.site.principles.push({ title: '', text: '' });
    renderProfile();
  }

  function deletePrinciple(index) {
    if (!window.confirm('删除这条分析原则？')) return;
    state.data.site.principles.splice(index, 1);
    renderProfile();
  }

  function addSkillGroup() {
    state.data.site.skills.push({ group: '新分组', items: [] });
    updateCounts();
    renderSkills();
  }

  function deleteSkillGroup(groupIndex) {
    const group = state.data.site.skills[groupIndex];
    if (!group) return;
    if (!window.confirm(`删除分组「${group.group || '未命名'}」及其中 ${group.items.length} 项技能？`)) {
      return;
    }
    state.data.site.skills.splice(groupIndex, 1);
    updateCounts();
    renderSkills();
  }

  function addSkillItem(groupIndex) {
    const group = state.data.site.skills[groupIndex];
    if (!group) return;
    group.items.push({ name: '新工具', level: '想学', score: 30, note: '' });
    updateCounts();
    renderSkills();
  }

  function deleteSkillItem(groupIndex, itemIndex) {
    const group = state.data.site.skills[groupIndex];
    if (!group) return;
    const item = group.items[itemIndex];
    if (!item) return;
    if (!window.confirm(`删除技能「${item.name || '未命名'}」？`)) return;
    group.items.splice(itemIndex, 1);
    updateCounts();
    renderSkills();
  }

  /* ----------------------------------------------------------------------
     14. 数量、状态与保存
     ---------------------------------------------------------------------- */
  function updateCounts() {
    if (!state.data) return;
    const counts = {
      notes: state.data.notes.items.length,
      projects: state.data.projects.items.length,
      timeline: state.data.timeline.milestones.length,
      resources: resourceEntries().length,
      skills: state.data.site.skills.reduce(
        (sum, group) => sum + (group.items || []).length,
        0
      )
    };

    Object.entries(counts).forEach(([key, value]) => {
      const element = $(`[data-count="${key}"]`);
      if (element) element.textContent = String(value);
    });
  }

  function refreshStatus() {
    const dirty = state.loaded ? dirtyFiles() : [];
    const repoText =
      state.config.owner && state.config.repo
        ? `${state.config.owner}/${state.config.repo} · ${state.config.branch || 'main'}`
        : '未配置';

    const repo = $('#repo-status');
    const token = $('#token-status');
    const dirtyEl = $('#dirty-status');
    const dot = $('#status-dot');
    const save = $('#save-all');

    if (repo) repo.textContent = `仓库：${repoText}`;
    if (token) {
      token.textContent = state.token ? 'Token：已配置' : 'Token：未配置（导出模式）';
      token.style.color = state.token ? 'var(--ok)' : '';
    }
    if (dirtyEl) {
      dirtyEl.textContent = dirty.length
        ? `${dirty.length} 个文件待提交：${dirty.map((file) => `${file}.json`).join('、')}`
        : '没有未提交的修改';
    }
    if (dot) {
      dot.classList.toggle('is-dirty', dirty.length > 0);
      dot.classList.toggle('is-ok', dirty.length === 0 && state.loaded);
    }
    if (save) {
      save.disabled = state.busy || !state.loaded || dirty.length === 0;
      save.textContent = state.busy
        ? '提交中…'
        : state.token
          ? '提交全部更改'
          : '导出更改';
    }

    document.title = `${dirty.length ? '• ' : ''}内容管理 · 刘铭哲`;
  }

  function normalizeForSave(files) {
    if (!files.includes('site')) return;
    const site = state.data.site;

    site.name = String(site.name || '').trim();
    site.role = String(site.role || '').trim();
    site.positioning = String(site.positioning || '').trim();
    site.intro = String(site.intro || '').trim();
    site.updated = String(site.updated || '').trim() || todayISO();
    site.focus = (site.focus || []).map((item) => String(item).trim()).filter(Boolean);

    (site.contact || []).forEach((contact) => {
      contact.label = String(contact.label || '').trim();
      contact.value = String(contact.value || '').trim();
      contact.href = String(contact.href || '').trim();
      contact.hint = String(contact.hint || '').trim();

      if (
        contact.icon === 'mail' &&
        /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact.href)
      ) {
        contact.href = `mailto:${contact.href}`;
      }
      if (
        contact.href &&
        !/^(https?:\/\/|mailto:|tel:|\/|\.{1,2}\/)/i.test(contact.href) &&
        /^[\w.-]+\.[a-z]{2,}/i.test(contact.href)
      ) {
        contact.href = `https://${contact.href}`;
      }
    });

    site.skills.forEach((group) => {
      group.group = String(group.group || '').trim();
      group.items.forEach((item) => {
        item.name = String(item.name || '').trim();
        item.note = String(item.note || '').trim();
        item.score = clampScore(item.score);
      });
    });
  }

  function validateFiles(files) {
    const order = ['notes', 'projects', 'timeline', 'resources', 'site'];
    for (const file of order) {
      if (!files.includes(file)) continue;
      const error =
        file === 'notes'
          ? validateNotes()
          : file === 'projects'
            ? validateProjects()
            : file === 'timeline'
              ? validateTimeline()
              : file === 'resources'
                ? validateResources()
                : validateSite();
      if (error) return error;
    }
    return null;
  }

  function errorResult(tab, key, message) {
    return { tab, key, message };
  }

  function validateNotes() {
    for (const note of state.data.notes.items) {
      const label = note.title || '未命名笔记';
      if (!String(note.title || '').trim()) {
        return errorResult('notes', note.__key, '有一篇笔记还没有标题。');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(note.date || ''))) {
        return errorResult('notes', note.__key, `笔记「${label}」的日期格式不对，应为 YYYY-MM-DD。`);
      }
      for (const field of ['url', 'repo']) {
        if (note[field] && !isHttpUrl(note[field])) {
          return errorResult('notes', note.__key, `笔记「${label}」的链接需要以 http(s):// 开头。`);
        }
      }
    }
    return null;
  }

  function validateProjects() {
    for (const project of state.data.projects.items) {
      const label = project.title || '未命名项目';
      if (!String(project.title || '').trim()) {
        return errorResult('projects', project.__key, '有一个项目还没有名称。');
      }
      if (!/^\d{4}-\d{2}(-\d{2})?$/.test(String(project.date || ''))) {
        return errorResult('projects', project.__key, `项目「${label}」的日期格式不对，应为 YYYY-MM。`);
      }
      for (const field of ['repo', 'demo']) {
        if (project[field] && !isHttpUrl(project[field])) {
          return errorResult('projects', project.__key, `项目「${label}」的链接需要以 http(s):// 开头。`);
        }
      }
    }
    return null;
  }

  function validateTimeline() {
    for (const item of state.data.timeline.milestones) {
      const label = item.title || '未命名节点';
      if (!String(item.title || '').trim()) {
        return errorResult('timeline', item.__key, '有一个时间线节点还没有标题。');
      }
      if (!/^\d{4}-\d{2}(-\d{2})?$/.test(String(item.date || ''))) {
        return errorResult('timeline', item.__key, `节点「${label}」的日期格式不对，应为 YYYY-MM。`);
      }
      if (!TIMELINE_TYPES.includes(item.type)) {
        return errorResult('timeline', item.__key, `节点「${label}」的类型不对。`);
      }
      if (item.link && !validHref(item.link)) {
        return errorResult('timeline', item.__key, `节点「${label}」的链接格式不对。`);
      }
    }
    return null;
  }

  function validateResources() {
    for (const group of state.data.resources.groups) {
      if (!String(group.category || '').trim()) {
        return errorResult('resources', null, '有一个资源分类还没有名称。');
      }
      for (const item of group.items) {
        const label = item.name || '未命名资源';
        if (!String(item.name || '').trim()) {
          return errorResult('resources', item.__key, `「${group.category}」里有一个资源还没有名称。`);
        }
        if (!isHttpUrl(item.url)) {
          return errorResult('resources', item.__key, `资源「${label}」需要一个 http(s):// 链接。`);
        }
      }
    }
    return null;
  }

  function validateSite() {
    const site = state.data.site;
    if (!String(site.name || '').trim()) {
      return errorResult('profile', null, '站点资料里还缺少姓名。');
    }

    for (const contact of site.contact || []) {
      if (!String(contact.value || '').trim()) {
        return errorResult('profile', null, '有一条联系方式缺少「显示文本」。');
      }
      if (contact.href && !validHref(contact.href)) {
        return errorResult('profile', null, `联系方式「${contact.label || contact.value}」的链接格式不对。`);
      }
    }

    for (const group of site.skills || []) {
      if (!String(group.group || '').trim()) {
        return errorResult('skills', null, '有一个技能分组还没有名称。');
      }
      for (const item of group.items || []) {
        if (!String(item.name || '').trim()) {
          return errorResult('skills', null, `分组「${group.group}」里有一个技能还没有名称。`);
        }
        if (!LEVELS.includes(item.level)) {
          return errorResult('skills', null, `技能「${item.name}」的状态需要是「在用 / 会 / 想学」。`);
        }
        const score = Number(item.score);
        if (!Number.isFinite(score) || score < 0 || score > 100) {
          return errorResult('skills', null, `技能「${item.name}」的分数需要在 0–100 之间。`);
        }
      }
    }

    return null;
  }

  function goToError(error) {
    state.tab = error.tab;
    if (error.key && ['notes', 'projects', 'timeline', 'resources'].includes(error.tab)) {
      state.selected[error.tab] = error.key;
    }
    $$('.admin-tab').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.tab === state.tab);
    });
    renderPanel();
    showToast(error.message, 'error');
  }

  async function saveAll() {
    if (state.busy || !state.loaded) return;

    const files = dirtyFiles();
    if (!files.length) {
      showToast('没有需要提交的修改。', 'info');
      return;
    }

    normalizeForSave(files);
    const error = validateFiles(files);
    if (error) {
      goToError(error);
      return;
    }

    if (!state.token) {
      openExport(files);
      return;
    }

    if (!state.config.owner || !state.config.repo) {
      showToast('先在 GitHub 设置里填写仓库信息。', 'error');
      openSettings();
      return;
    }

    state.busy = true;
    refreshStatus();
    const panel = $('#admin-panel');
    if (panel) panel.setAttribute('inert', '');
    const commits = [];

    try {
      for (const file of files) {
        const dirtyEl = $('#dirty-status');
        if (dirtyEl) dirtyEl.textContent = `正在提交 ${file}.json…`;
        const content = currentJson(file);
        const commit = await commitFile(file, content);
        state.snapshots[file] = content;
        commits.push({ file, url: commit && commit.html_url });
      }

      showToast(
        `已提交 ${commits.length} 个文件，GitHub Pages 大约 1 分钟后更新。`,
        'success',
        { link: commits[0] && commits[0].url, linkText: '查看提交', duration: 8000 }
      );
    } catch (error) {
      showToast(`提交失败：${error.message}`, 'error', { duration: 9000 });
    } finally {
      state.busy = false;
      if (panel) panel.removeAttribute('inert');
      renderPanel();
      refreshStatus();
    }
  }

  /* ----------------------------------------------------------------------
     15. GitHub Contents API
     ---------------------------------------------------------------------- */
  class GitHubError extends Error {
    constructor(message, status) {
      super(message);
      this.name = 'GitHubError';
      this.status = status || 0;
    }
  }

  function repoConfig() {
    return {
      owner: String(state.config.owner || '').trim(),
      repo: String(state.config.repo || '').trim(),
      branch: String(state.config.branch || 'main').trim() || 'main'
    };
  }

  function contentsUrl(path) {
    const { owner, repo } = repoConfig();
    const encodedPath = path
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
    return `${GH_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`;
  }

  function describeGitHubError(status, payload) {
    if (status === 401) return 'Token 无效或已过期，请重新生成后保存。';
    if (status === 403) {
      return '没有写入权限，或 Token 权限不足（需要 Contents: Read and write）。';
    }
    if (status === 404) {
      return '仓库或文件不存在，检查 owner / repo / branch，以及 Token 的仓库访问权限。';
    }
    if (status === 409) {
      return '远程文件已经被修改，请点击「重新加载」后再提交。';
    }
    if (status === 422) return payload && payload.message ? payload.message : 'GitHub 拒绝了这次提交。';
    return (payload && payload.message) || `GitHub 请求失败（HTTP ${status}）。`;
  }

  async function githubFetch(url, options = {}, token = state.token) {
    let response;
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(options.headers || {})
        }
      });
    } catch (error) {
      throw new GitHubError(`网络请求失败：${error.message}`);
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!response.ok) {
      throw new GitHubError(describeGitHubError(response.status, payload), response.status);
    }
    return payload;
  }

  async function getFileSha(path) {
    const { branch } = repoConfig();
    try {
      const payload = await githubFetch(
        `${contentsUrl(path)}?ref=${encodeURIComponent(branch)}`
      );
      return payload && payload.sha ? payload.sha : null;
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return null;
      throw error;
    }
  }

  function toBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(index, index + chunk));
    }
    return btoa(binary);
  }

  function commitMessage(file) {
    const now = new Date();
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(
      now.getHours()
    )}:${pad(now.getMinutes())}`;
    return `content: update ${FILE_LABELS[file]} (${file}.json) ${stamp}`;
  }

  async function commitFile(file, content) {
    const { branch } = repoConfig();
    if (!state.config.owner || !state.config.repo) {
      throw new GitHubError('还没有配置仓库信息。');
    }

    const path = `data/${file}.json`;
    const sha = await getFileSha(path);
    const body = {
      message: commitMessage(file),
      content: toBase64(content == null ? currentJson(file) : content),
      branch
    };
    if (sha) body.sha = sha;

    return githubFetch(contentsUrl(path), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  /* ----------------------------------------------------------------------
     16. 导出与设置弹窗
     ---------------------------------------------------------------------- */
  function openExport(files) {
    const list = files && files.length ? files : Object.keys(DATA_FILES);
    const dialog = $('#export-dialog');
    const desc = $('#export-desc');
    const container = $('#export-list');
    if (!dialog || !desc || !container) return;

    desc.innerHTML = state.token
      ? '下载后覆盖 <code>data/</code> 下的同名文件，再提交到 GitHub。'
      : '还没有配置 GitHub Token。编辑内容只保存在当前浏览器；下载后覆盖 <code>data/</code> 下的同名文件，再上传到 GitHub。';

    container.innerHTML = list
      .map((file) => {
        const size = new Blob([currentJson(file)]).size;
        return `<div class="export-row">
          <span class="export-file">
            <span class="export-name">data/${file}.json</span>
            <span class="export-size">${FILE_LABELS[file]} · ${(size / 1024).toFixed(1)} KB</span>
          </span>
          <button class="mini-btn" type="button" data-export-download="${file}">下载</button>
          <button class="mini-btn" type="button" data-export-copy="${file}">复制</button>
        </div>`;
      })
      .join('');

    showModal(dialog);
  }

  function bindExportDialog() {
    const dialog = $('#export-dialog');
    if (!dialog) return;
    bindDialogClose(dialog);

    dialog.addEventListener('click', async (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const download = target.closest('[data-export-download]');
      if (download) {
        downloadJson(download.dataset.exportDownload);
        showToast(`已下载 ${download.dataset.exportDownload}.json`, 'success');
        return;
      }

      const copy = target.closest('[data-export-copy]');
      if (copy) {
        const file = copy.dataset.exportCopy;
        const ok = await copyText(currentJson(file));
        showToast(ok ? `已复制 ${file}.json` : '复制失败，请改用下载。', ok ? 'success' : 'error');
      }
    });

    const settingsButton = $('#export-open-settings');
    if (settingsButton) {
      settingsButton.addEventListener('click', () => {
        closeDialog(dialog);
        openSettings();
      });
    }
  }

  function openSettings() {
    const dialog = $('#settings-dialog');
    if (!dialog) return;

    $('#cfg-owner').value = state.config.owner || '';
    $('#cfg-repo').value = state.config.repo || '';
    $('#cfg-branch').value = state.config.branch || 'main';
    $('#cfg-token').value = '';
    $('#cfg-token').placeholder = state.token
      ? '留空则保持已保存的 Token'
      : 'github_pat_...';

    let remember = true;
    try {
      const localToken = localStorage.getItem(TOKEN_KEY);
      const sessionToken = sessionStorage.getItem(TOKEN_KEY);
      remember = localToken ? true : sessionToken ? false : true;
    } catch (error) {
      remember = true;
    }
    $('#cfg-remember').checked = remember;

    showModal(dialog);
  }

  function bindSettings() {
    const dialog = $('#settings-dialog');
    const form = $('#settings-form');
    if (!dialog || !form) return;

    form.addEventListener('submit', (event) => {
      event.preventDefault();

      const owner = $('#cfg-owner').value.trim();
      const repo = $('#cfg-repo').value.trim();
      const branch = $('#cfg-branch').value.trim() || 'main';
      const tokenInput = $('#cfg-token').value.trim();
      const remember = $('#cfg-remember').checked;

      if (!owner || !repo) {
        showToast('请填写仓库所有者和仓库名。', 'error');
        return;
      }
      if (/[\s/]/.test(owner) || /[\s/]/.test(repo)) {
        showToast('仓库所有者 / 仓库名不能包含空格或斜杠。', 'error');
        return;
      }

      if (/\s/.test(branch)) {
        showToast('分支名不能包含空格。', 'error');
        return;
      }

      if (tokenInput) state.token = tokenInput;
      state.config = { owner, repo, branch };
      saveConfig();

      if (state.token) {
        const stored = persistToken(state.token, remember);
        if (!stored) {
          showToast('浏览器不允许保存 Token，本次仍可使用，但刷新后会丢失。', 'error');
        }
      }

      closeDialog(dialog);
      refreshStatus();
      showToast('GitHub 设置已保存。', 'success');
    });

    const clear = $('#clear-token');
    if (clear) {
      clear.addEventListener('click', () => {
        state.token = '';
        persistToken('', true);
        const input = $('#cfg-token');
        if (input) input.value = '';
        refreshStatus();
        showToast('本机 Token 已清除。', 'success');
      });
    }

    const test = $('#test-connection');
    if (test) {
      test.addEventListener('click', async () => {
        const owner = $('#cfg-owner').value.trim();
        const repo = $('#cfg-repo').value.trim();
        const token = $('#cfg-token').value.trim() || state.token;
        if (!owner || !repo) {
          showToast('先填写仓库所有者和仓库名。', 'error');
          return;
        }
        if (!token) {
          showToast('先填写 Token 再测试连接。', 'error');
          return;
        }

        const original = test.textContent;
        test.disabled = true;
        test.textContent = '测试中…';
        try {
          const info = await githubFetch(
            `${GH_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
            {},
            token
          );
          const permission =
            info.permissions && info.permissions.push === false
              ? '（注意：当前 Token 可能没有 Contents 写权限）'
              : '';
          showToast(
            `连接成功：${info.full_name}，默认分支 ${info.default_branch}${permission}`,
            permission ? 'error' : 'success',
            { duration: 7000 }
          );
        } catch (error) {
          showToast(`连接失败：${error.message}`, 'error', { duration: 8000 });
        } finally {
          test.disabled = false;
          test.textContent = original;
        }
      });
    }

    bindDialogClose(dialog);
  }

  function bindDialogClose(dialog) {
    $$('[data-close]').forEach((button) => {
      if (button.dataset.close !== dialog.id) return;
      button.addEventListener('click', () => closeDialog(dialog));
    });

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
  }

  /* ----------------------------------------------------------------------
     17. 工具栏、快捷键与启动
     ---------------------------------------------------------------------- */
  function bindToolbar() {
    const save = $('#save-all');
    const refresh = $('#refresh');
    const exportAll = $('#export-all');
    const logoutButton = $('#logout');
    const settingsButton = $('#open-settings');
    const theme = $('#admin-theme');

    if (save) save.addEventListener('click', saveAll);

    if (refresh) {
      refresh.addEventListener('click', async () => {
        if (state.busy || state.loading) return;
        if (dirtyFiles().length && !window.confirm('有未提交的修改，重新加载会丢失，继续？')) {
          return;
        }
        state.loaded = false;
        state.snapshots = {};
        state.data = null;
        await loadData();
      });
    }

    if (exportAll) {
      exportAll.addEventListener('click', () => {
        if (!state.loaded) return;
        openExport(Object.keys(DATA_FILES));
      });
    }

    if (logoutButton) logoutButton.addEventListener('click', logout);
    if (settingsButton) settingsButton.addEventListener('click', openSettings);

    if (theme) {
      theme.addEventListener('click', () => {
        const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
        setTheme(next);
      });
    }

    document.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        if (state.loaded && !$('#dashboard').hidden) {
          event.preventDefault();
          saveAll();
        }
      }
    });

    window.addEventListener('beforeunload', (event) => {
      if (state.loaded && !state.busy && dirtyFiles().length) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }

  function bindTabs() {
    $$('.admin-tab').forEach((button) => {
      button.addEventListener('click', () => setTab(button.dataset.tab));
    });
  }

  function init() {
    syncThemeButton();
    bindLogin();
    bindTabs();
    bindPanel();
    bindToolbar();
    bindSettings();
    bindExportDialog();
    refreshStatus();

    if (hasSession()) {
      enterDashboard();
    }
  }

  init();
})();
