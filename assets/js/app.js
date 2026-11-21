/* ==========================================================================
   刘铭哲 · 生物信息学学习记录 — 前端逻辑
   --------------------------------------------------------------------------
   这是一个「数据驱动」的静态站：
   · 页面结构由 data/*.json 决定，改内容不用动 HTML；
   · 使用 hash 路由（#/notes 这类），GitHub Pages 不需要额外配置；
   · 没有框架、没有构建步骤，直接部署即可。

   想加一篇笔记？复制 data/notes.json 里的一段对象，改字段就行。
   ========================================================================== */

(function () {
  'use strict';

  /* ----------------------------------------------------------------------
     1. 常量
     ---------------------------------------------------------------------- */
  const DATA_FILES = {
    site: 'data/site.json',
    notes: 'data/notes.json',
    projects: 'data/projects.json',
    timeline: 'data/timeline.json',
    resources: 'data/resources.json'
  };

  const ROUTES = ['home', 'about', 'notes', 'projects', 'timeline', 'resources'];

  const LEVEL_KEYS = { '在用': 'using', '会': 'known', '想学': 'want' };
  const TYPE_KEYS = { '学习': 'study', '项目': 'project', '里程碑': 'milestone' };
  const STATUS_KEYS = { '进行中': 'ongoing', '持续维护': 'maintained', '已完成': 'done' };

  const FALLBACK_LEVELS = [
    { label: '在用', desc: '日常分析里持续使用，能独立跑完流程并排查常见问题。' },
    { label: '会', desc: '能看懂、能改、能跑通，遇到复杂问题还需要查文档。' },
    { label: '想学', desc: '已经列进计划，正在补基础，暂时不接相关任务。' }
  ];

  const state = { data: null };
  const app = document.getElementById('app');

  /* ----------------------------------------------------------------------
     2. 工具函数
     ---------------------------------------------------------------------- */
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]);

  // 允许 http(s)、mailto、tel 和站内相对路径，挡掉 javascript: 之类的地址
  function safeUrl(value) {
    const url = String(value == null ? '' : value).trim();
    if (!url) return '';
    if (/^(https?:\/\/|mailto:|tel:)/i.test(url)) return url;
    if (/^(?![a-z][a-z0-9+.-]*:)(?!\/\/)[\w./%#?=&-]+$/i.test(url)) return url;
    return '';
  }

  function fmtDate(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text) return '—';
    return text.slice(0, 10).replace(/-/g, '.');
  }

  function fmtMonth(value) {
    const match = String(value == null ? '' : value).match(/^\d{4}-(\d{2})/);
    return match ? `${Number(match[1])} 月` : String(value || '');
  }

  const sortedByDate = (items) =>
    [...(items || [])].sort((a, b) =>
      String(b.date || '').localeCompare(String(a.date || ''))
    );

  function clampScore(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  function levelClass(label) {
    return LEVEL_KEYS[label] || 'known';
  }

  function typeClass(label) {
    return TYPE_KEYS[label] || 'study';
  }

  function statusClass(label) {
    return STATUS_KEYS[label] || 'done';
  }

  function flattenSkills(site) {
    return (site.skills || []).flatMap((group) =>
      (group.items || []).map((item) => ({ ...item, group: group.group }))
    );
  }

  function tagCounts(items) {
    const map = new Map();
    items.forEach((item) => {
      (item.tags || []).forEach((tag) => map.set(tag, (map.get(tag) || 0) + 1));
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'));
  }

  function hostname(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch (error) {
      return '';
    }
  }

  function heroTitle(positioning) {
    const raw = String(positioning || '').trim();
    if (!raw) return '把测序数据<br><em>变成能复现的结论</em>';
    const parts = raw.split(/[，,]/);
    if (parts.length > 1) {
      return `${esc(parts[0])}<br><em>${esc(parts.slice(1).join('，'))}</em>`;
    }
    return esc(raw);
  }

  /* ----------------------------------------------------------------------
     3. 图标（内联 SVG，不依赖图标库）
     ---------------------------------------------------------------------- */
  const ICONS = {
    arrow: '<path d="M4 12h15M13 5l7 7-7 7"/>',
    external:
      '<path d="M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.4-3.4"/>',
    book:
      '<path d="M4 19.2A2.8 2.8 0 0 1 6.8 16.4H20V3H6.8A2.8 2.8 0 0 0 4 5.8v13.4Z"/><path d="M4 19.2A2.8 2.8 0 0 0 6.8 22H20v-5.6"/>',
    code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>',
    route:
      '<circle cx="6" cy="6" r="2.6"/><circle cx="18" cy="18" r="2.6"/><path d="M8.6 6H14a4 4 0 0 1 0 8H9.6a4 4 0 0 0 0 8h5.8"/>',
    database:
      '<ellipse cx="12" cy="5.5" rx="7" ry="3"/><path d="M5 5.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/><path d="M5 11.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    mail:
      '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    github:
      '<path fill="currentColor" stroke="none" d="M12 2C6.48 2 2 6.58 2 12.26c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.48 0-.24-.01-.87-.01-1.7-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.49-1.11-1.49-.9-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.37-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05a9.4 9.4 0 0 1 2.5-.34c.85 0 1.71.12 2.5.34 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.06.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.59.69.48A10.02 10.02 0 0 0 22 12.26C22 6.58 17.52 2 12 2Z"/>',
    globe:
      '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z"/>',
    chat: '<path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-6.6A8 8 0 0 1 11 4h2a8 8 0 0 1 8 8Z"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
    check: '<path d="m5 12 4.5 4.5L19 7"/>'
  };

  function icon(name, cls = '') {
    const body = ICONS[name] || '';
    return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  /* ----------------------------------------------------------------------
     4. 装饰：首页的 DNA 双螺旋
     ---------------------------------------------------------------------- */
  function helixSvg() {
    const W = 220;
    const H = 480;
    const mid = W / 2;
    const amp = 50;
    const period = 200;
    const xA = (y) => mid + amp * Math.sin((y / period) * Math.PI * 2);
    const xB = (y) => mid - amp * Math.sin((y / period) * Math.PI * 2);

    const ys = [];
    for (let y = 0; y <= H; y += 4) ys.push(y);

    const pathA = ys.map((y, i) => `${i ? 'L' : 'M'}${xA(y).toFixed(1)} ${y}`).join(' ');
    const pathB = ys.map((y, i) => `${i ? 'L' : 'M'}${xB(y).toFixed(1)} ${y}`).join(' ');

    const rungs = [];
    for (let y = 20; y < H; y += 18) {
      const x1 = xA(y);
      const x2 = xB(y);
      if (Math.abs(x1 - x2) < 8) continue;
      rungs.push(
        `<line class="rung" x1="${x1.toFixed(1)}" y1="${y}" x2="${x2.toFixed(1)}" y2="${y}"/>`
      );
    }

    const nodes = [];
    for (let y = 24, i = 0; y < H; y += 74, i += 1) {
      nodes.push(
        `<circle class="node${i % 2 ? ' node--b' : ''}" cx="${xA(y).toFixed(1)}" cy="${y}" r="2.6"/>`,
        `<circle class="node${i % 2 ? ' node--b' : ''}" cx="${xB(y + 37).toFixed(1)}" cy="${y + 37}" r="2.2" opacity=".7"/>`
      );
    }

    return `<svg class="helix" viewBox="0 0 ${W} ${H}" role="presentation" focusable="false">
      <path class="strand strand--a" d="${pathA}"/>
      <path class="strand strand--b" d="${pathB}"/>
      ${rungs.join('')}
      ${nodes.join('')}
    </svg>`;
  }

  /* ----------------------------------------------------------------------
     5. 数据加载
     ---------------------------------------------------------------------- */
  async function loadData() {
    if (location.protocol === 'file:') {
      const error = new Error('浏览器不允许 file:// 页面读取本地 JSON');
      error.code = 'file-protocol';
      throw error;
    }

    const entries = await Promise.all(
      Object.entries(DATA_FILES).map(async ([key, path]) => {
        const response = await fetch(path, { cache: 'no-cache' });
        if (!response.ok) {
          throw new Error(`${path} 请求失败（HTTP ${response.status}）`);
        }
        try {
          return [key, await response.json()];
        } catch (error) {
          throw new Error(`${path} 不是合法的 JSON：${error.message}`);
        }
      })
    );

    state.data = Object.fromEntries(entries);
  }

  /* ----------------------------------------------------------------------
     6. 页面片段
     ---------------------------------------------------------------------- */

  // 小标题 + 右侧「查看全部」
  function sectionHead(eyebrow, title, desc, moreHref, moreLabel) {
    return `<div class="section-head">
      <div>
        <p class="eyebrow">${esc(eyebrow)}</p>
        <h2>${esc(title)}</h2>
        ${desc ? `<p>${esc(desc)}</p>` : ''}
      </div>
      ${moreHref ? `<a class="more" href="${esc(moreHref)}">${esc(moreLabel || '查看全部')} ${icon('arrow')}</a>` : ''}
    </div>`;
  }

  function skillLineHtml(skill) {
    const score = clampScore(skill.score);
    return `<div class="skill-line">
      <div class="skill-line-head">
        <span class="skill-line-name">${esc(skill.name)}</span>
      </div>
      <span class="badge badge--${levelClass(skill.level)}">${esc(skill.level)}</span>
      <div class="bar" role="img" aria-label="${esc(skill.name)} 熟练度 ${score}%">
        <span style="width:${score}%"></span>
      </div>
    </div>`;
  }

  function tagListHtml(tags, limit = 99) {
    return `<ul class="tags">${(tags || [])
      .slice(0, limit)
      .map((tag) => `<li class="tag">${esc(tag)}</li>`)
      .join('')}</ul>`;
  }

  function noteItemHtml(note, compact = false) {
    const url = safeUrl(note.url);
    const repo = safeUrl(note.repo);
    const title = esc(note.title || '未命名笔记');
    const titleHtml = url
      ? `<a href="${esc(url)}" target="_blank" rel="noopener">${title}${icon('external', 'icon-sm')}</a>`
      : title;

    return `<article class="note-item${compact ? ' note-item--compact' : ''}">
      <div class="note-date"><time datetime="${esc(note.date)}">${fmtDate(note.date)}</time></div>
      <div class="note-body">
        <h2 class="note-title">${titleHtml}</h2>
        <p class="note-summary">${esc(note.summary || '')}</p>
        <div class="note-foot">
          ${tagListHtml(note.tags, compact ? 3 : 8)}
          <div class="note-links">
            ${note.readTime ? `<span class="note-read">${esc(note.readTime)}</span>` : ''}
            ${repo ? `<a class="text-link" href="${esc(repo)}" target="_blank" rel="noopener">${icon('github', 'icon-sm')}代码</a>` : ''}
            ${url ? `<a class="text-link" href="${esc(url)}" target="_blank" rel="noopener">全文 ${icon('external', 'icon-sm')}</a>` : ''}
          </div>
        </div>
      </div>
    </article>`;
  }

  function projectMiniHtml(project) {
    const url = safeUrl(project.repo || project.demo);
    const status = statusClass(project.status);
    const inner = `<div class="mini-meta">
        <span class="status status--${status}"><span class="status-dot"></span>${esc(project.status || '已完成')}</span>
        <span>${fmtDate(project.date)}</span>
      </div>
      <h3>${esc(project.title)}</h3>
      <p>${esc(project.summary || '')}</p>`;

    return url
      ? `<a class="project-mini" href="${esc(url)}" target="_blank" rel="noopener">${inner}</a>`
      : `<div class="project-mini">${inner}</div>`;
  }

  function projectCardHtml(project, index) {
    const repo = safeUrl(project.repo);
    const demo = safeUrl(project.demo);
    const primary = repo || demo;
    const title = esc(project.title || '未命名项目');
    const status = statusClass(project.status);
    const links =
      repo || demo
        ? `<div class="card-links">
            ${repo ? `<a class="text-link" href="${esc(repo)}" target="_blank" rel="noopener">${icon('github')}GitHub 仓库</a>` : ''}
            ${demo ? `<a class="text-link" href="${esc(demo)}" target="_blank" rel="noopener">${icon('external')}在线查看</a>` : ''}
          </div>`
        : '';

    return `<article class="project-card" data-reveal>
      <span class="project-index">${String(index + 1).padStart(2, '0')}</span>
      <div class="project-top">
        <span class="status status--${status}"><span class="status-dot"></span>${esc(project.status || '已完成')}</span>
        <time class="project-date" datetime="${esc(project.date)}">${fmtDate(project.date)}</time>
      </div>
      <h2>${primary ? `<a href="${esc(primary)}" target="_blank" rel="noopener">${title}</a>` : title}</h2>
      <p class="project-summary">${esc(project.summary || '')}</p>
      ${(project.highlights || []).length
        ? `<ul class="project-points">${project.highlights.map((point) => `<li>${esc(point)}</li>`).join('')}</ul>`
        : ''}
      ${tagListHtml(project.tags)}
      ${links}
    </article>`;
  }

  function contactHtml(site) {
    const contacts = site.contact || [];
    return contacts
      .map((item) => {
        const href = safeUrl(item.href);
        const external = /^https?:/i.test(href);
        const value = href
          ? `<a class="contact-value" href="${esc(href)}"${external ? ' target="_blank" rel="noopener"' : ''}>${esc(item.value)}</a>`
          : `<span class="contact-value">${esc(item.value)}</span>`;

        return `<li class="contact-item">
          <span class="contact-icon">${icon(item.icon || 'globe')}</span>
          <div class="contact-body">
            <span class="contact-label">${esc(item.label)}</span>
            ${value}
            ${item.hint ? `<span class="contact-hint">${esc(item.hint)}</span>` : ''}
          </div>
          ${item.copy ? `<button class="copy-btn" type="button" data-copy="${esc(item.value)}" aria-label="复制${esc(item.label)}">${icon('copy')}<span>复制</span></button>` : ''}
        </li>`;
      })
      .join('');
  }

  function legendHtml(site) {
    const levels = (site.levels || []).length ? site.levels : FALLBACK_LEVELS;
    return levels
      .map(
        (level) => `<div class="legend-item">
          <span class="badge badge--${levelClass(level.label)}">${esc(level.label)}</span>
          <p>${esc(level.desc)}</p>
        </div>`
      )
      .join('');
  }

  function footerContact(site) {
    return (site.contact || []).find((item) => item.icon === 'github' && safeUrl(item.href));
  }

  /* ----------------------------------------------------------------------
     7. 页面：首页
     ---------------------------------------------------------------------- */
  function pageHome() {
    const { site, notes, projects, timeline, resources } = state.data;
    const noteItems = sortedByDate(notes.items);
    const projectItems = sortedByDate(projects.items);
    const milestones = sortedByDate(timeline.milestones);
    const skills = flattenSkills(site);
    const resourceTotal = (resources.groups || []).reduce(
      (total, group) => total + (group.items || []).length,
      0
    );

    const topSkills = [...skills]
      .filter((skill) => skill.level !== '想学')
      .sort((a, b) => clampScore(b.score) - clampScore(a.score))
      .slice(0, 6);

    const featured = projectItems.filter((project) => project.featured);
    const chosenProjects = (featured.length ? featured : projectItems).slice(0, 2);
    const latestNotes = noteItems.slice(0, 3);
    const latestMilestones = milestones.slice(0, 4);
    const github = footerContact(site);
    const mail = (site.contact || []).find((item) => item.icon === 'mail' && safeUrl(item.href));

    const quickCards = [
      {
        href: '#/notes',
        icon: 'book',
        index: '02',
        title: '学习笔记',
        desc: '参数、报错和判断依据，写成能复查的文字。',
        meta: `${noteItems.length} 篇`
      },
      {
        href: '#/projects',
        icon: 'code',
        index: '03',
        title: '项目',
        desc: '从原始数据到结果，代码全部放在 GitHub。',
        meta: `${projectItems.length} 个`
      },
      {
        href: '#/timeline',
        icon: 'route',
        index: '04',
        title: '成长时间线',
        desc: '按季度回看学过什么、做完了什么。',
        meta: `${milestones.length} 个节点`
      },
      {
        href: '#/resources',
        icon: 'database',
        index: '05',
        title: '资源收藏',
        desc: '常用的数据库、工具和文档入口。',
        meta: `${resourceTotal} 个入口`
      }
    ];

    const html = `<div class="wrap">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow">${esc(site.name)} · 生物信息学学习记录</p>
          <h1 class="hero-title">${heroTitle(site.positioning)}</h1>
          <p class="lede">${esc(site.intro)}</p>
          <div class="hero-actions">
            <a class="btn btn-primary" href="#/notes">看学习笔记 ${icon('arrow')}</a>
            <a class="btn btn-ghost" href="#/about">关于我 ${icon('arrow')}</a>
          </div>
          <div class="stats">
            <div class="stat">
              <span class="stat-num">${noteItems.length}<small>篇</small></span>
              <span class="stat-label">学习笔记</span>
            </div>
            <div class="stat">
              <span class="stat-num">${projectItems.length}<small>个</small></span>
              <span class="stat-label">项目</span>
            </div>
            <div class="stat">
              <span class="stat-num">${milestones.length}<small>条</small></span>
              <span class="stat-label">成长节点</span>
            </div>
            <div class="stat">
              <span class="stat-num">${skills.length}<small>项</small></span>
              <span class="stat-label">工具与方向</span>
            </div>
          </div>
        </div>

        <div class="hero-visual" data-reveal>
          <div class="helix-wrap">${helixSvg()}</div>
          <p class="helix-caption"><span>DNA · double helix</span><span>ATGC</span></p>
          <div class="helix-tags" aria-hidden="true">
            <span class="helix-tag helix-tag--1">Linux</span>
            <span class="helix-tag helix-tag--2">Python</span>
            <span class="helix-tag helix-tag--3">R</span>
          </div>
        </div>
      </section>

      <section class="section">
        ${sectionHead('站点导航', '从哪开始看', '笔记、项目、时间线、资源四个入口；个人背景和技能矩阵在「关于我」。内容都来自 data/ 下的 JSON 文件。')}
        <div class="quick-grid">
          ${quickCards
            .map(
              (card) => `<a class="quick-card" href="${card.href}" data-reveal>
                <span class="quick-index">${card.index}</span>
                <span class="quick-icon">${icon(card.icon)}</span>
                <span class="quick-title">${esc(card.title)}</span>
                <span class="quick-desc">${esc(card.desc)}</span>
                <span class="quick-meta">${esc(card.meta)} ${icon('arrow')}</span>
              </a>`
            )
            .join('')}
        </div>
      </section>

      <section class="section">
        ${sectionHead(
          '技能矩阵',
          '会的、在用的、想学的',
          '自评熟练度，按最近三个月的实际使用情况更新。完整矩阵里有每个工具的说明。',
          '#/about',
          '完整矩阵'
        )}
        <div class="skill-preview">
          ${topSkills.map(skillLineHtml).join('')}
        </div>
        <p class="footnote">在用 = 日常分析里持续使用；会 = 能跑通、能改；想学 = 已列入计划。</p>
      </section>

      <section class="section">
        ${sectionHead('最近更新', '最新笔记', '每篇只写思路、关键参数和结论，完整命令与代码链到 GitHub。', '#/notes', '全部笔记')}
        <div class="home-feed">
          <div class="note-list note-list--compact">
            ${latestNotes.map((note) => noteItemHtml(note, true)).join('')}
          </div>
          <aside class="home-projects" aria-label="精选项目">
            <p class="mini-head">精选项目</p>
            ${chosenProjects.map(projectMiniHtml).join('')}
            <a class="more" href="#/projects">全部项目 ${icon('arrow')}</a>
          </aside>
        </div>
      </section>

      <section class="section">
        ${sectionHead('成长时间线', '最近在做什么', '按月记录，按季度回看。', '#/timeline', '完整时间线')}
        <div class="home-timeline">
          ${latestMilestones
            .map(
              (milestone) => `<a class="mini-tl" href="#/timeline" data-reveal>
                <span class="mini-tl-date">${fmtDate(milestone.date)}</span>
                <div class="mini-tl-body">
                  <h3>${esc(milestone.title)}</h3>
                  <p>${esc(milestone.detail)}</p>
                </div>
              </a>`
            )
            .join('')}
        </div>
      </section>

      <section class="section contact-cta">
        <div class="cta-card" data-reveal>
          <p class="eyebrow">保持联系</p>
          <h2>想交流分析流程、项目，或者有合适的机会？</h2>
          <p>${(site.focus || []).length ? `我目前关注${esc(site.focus.join('、'))}。` : ''}看到消息会尽快回复。</p>
          <div class="hero-actions">
            ${mail ? `<a class="btn btn-primary" href="${esc(safeUrl(mail.href))}">${icon('mail')}发邮件</a>` : ''}
            ${github ? `<a class="btn btn-ghost" href="${esc(safeUrl(github.href))}" target="_blank" rel="noopener">${icon('github')}GitHub</a>` : ''}
          </div>
        </div>
      </section>
    </div>`;

    return {
      title: `${site.name} · ${site.role}`,
      description: site.intro,
      html
    };
  }

  /* ----------------------------------------------------------------------
     8. 页面：关于我
     ---------------------------------------------------------------------- */
  function pageAbout() {
    const { site } = state.data;
    const skills = flattenSkills(site);
    const groups = site.skills || [];
    const countLevel = (label) => skills.filter((skill) => skill.level === label).length;

    const html = `<div class="wrap">
      <header class="page-head">
        <p class="eyebrow">01 / 关于我</p>
        <h1>${esc(site.name)}</h1>
        <p class="lede">${esc(site.role)}。${esc((site.focus || []).length ? `关注${site.focus.join('、')}。` : '')}</p>
        <div class="page-meta">
          <span>${esc(site.positioning)}</span>
          <span>${skills.length} 项工具与方向</span>
          <span>更新于 ${fmtDate(site.updated)}</span>
        </div>
      </header>

      <section class="section">
        <div class="position-card">
          <p class="eyebrow">一句话定位</p>
          <p class="position-text">${esc(site.positioning)}</p>
          <p class="position-sub">${esc(site.intro)}</p>
          <ul class="focus-list">
            ${(site.focus || []).map((item) => `<li>${esc(item)}</li>`).join('')}
          </ul>
        </div>
      </section>

      <section class="section" id="skills">
        <div class="section-head">
          <div>
            <p class="eyebrow">技能矩阵</p>
            <h2>会的、在用的、想学的</h2>
            <p>${skills.length} 项工具与方向：在用 ${countLevel('在用')} 项、会 ${countLevel('会')} 项、想学 ${countLevel('想学')} 项。熟练度是 0–100 的自评，面试官只看这一张表，就能知道我现在能做什么、还在补什么。</p>
          </div>
        </div>

        <table class="skill-matrix">
          <caption class="sr-only">技能矩阵：工具、状态、自评熟练度与说明</caption>
          <thead>
            <tr>
              <th scope="col">工具 / 方向</th>
              <th scope="col">状态</th>
              <th scope="col">熟练度</th>
              <th scope="col">说明</th>
            </tr>
          </thead>
          <tbody>
            ${groups
              .map(
                (group) => `<tr class="group-row">
                  <th colspan="4" scope="rowgroup">
                    <span class="group-name">${esc(group.group)}<span class="group-count">${(group.items || []).length} 项</span></span>
                  </th>
                </tr>
                ${(group.items || [])
                  .map((item) => {
                    const score = clampScore(item.score);
                    return `<tr>
                      <td class="skill-name">${esc(item.name)}</td>
                      <td class="skill-level"><span class="badge badge--${levelClass(item.level)}">${esc(item.level)}</span></td>
                      <td class="skill-score">
                        <div class="bar" role="img" aria-label="${esc(item.name)} 熟练度 ${score}%"><span style="width:${score}%"></span></div>
                        <span class="score-num">${score}</span>
                      </td>
                      <td class="skill-note">${esc(item.note || '')}</td>
                    </tr>`;
                  })
                  .join('')}`
              )
              .join('')}
          </tbody>
        </table>

        <div class="legend">
          ${legendHtml(site)}
        </div>
        <p class="footnote">熟练度只代表我自己的判断，不等于能独立承担生产级分析；「想学」的方向目前不接相关任务。</p>
      </section>

      <section class="section">
        <div class="split">
          <div class="panel">
            <p class="eyebrow">现在</p>
            <h2>最近在做什么</h2>
            <ul class="now-list">
              ${(site.now || [])
                .map(
                  (item) => `<li class="now-item">
                    <span class="now-label">${esc(item.label)}</span>
                    <p>${esc(item.text)}</p>
                  </li>`
                )
                .join('')}
            </ul>
          </div>
          <div class="panel" id="contact">
            <p class="eyebrow">联系</p>
            <h2>找到我</h2>
            <ul class="contact-list">
              ${contactHtml(site)}
            </ul>
          </div>
        </div>
      </section>

      <section class="section">
        ${sectionHead('方法', '我怎么做分析', '三条原则，用来提醒自己别把分析做成一次性劳动。')}
        <div class="principle-grid">
          ${(site.principles || [])
            .map(
              (item, index) => `<article class="principle" data-reveal>
                <span class="principle-index">0${index + 1}</span>
                <h3>${esc(item.title)}</h3>
                <p>${esc(item.text)}</p>
              </article>`
            )
            .join('')}
        </div>
      </section>

      <section class="section">
        <div class="maintain-card">
          <div>
            <p class="eyebrow">关于本站</p>
            <h2>内容怎么更新</h2>
            <p>笔记、项目、时间线和资源都存放在 <code>data/</code> 下的 JSON 文件里，页面只负责渲染。新增一条内容 = 复制一段 JSON、改字段、刷新页面。</p>
          </div>
          <div class="maintain-links">
            <a href="data/notes.json" target="_blank" rel="noopener">notes.json</a>
            <a href="data/projects.json" target="_blank" rel="noopener">projects.json</a>
            <a href="data/timeline.json" target="_blank" rel="noopener">timeline.json</a>
            <a href="data/resources.json" target="_blank" rel="noopener">resources.json</a>
          </div>
        </div>
      </section>
    </div>`;

    return {
      title: `关于我 · ${site.name}`,
      description: `${site.name} · ${site.role}。${site.positioning}。${site.intro}`,
      html
    };
  }

  /* ----------------------------------------------------------------------
     9. 页面：学习笔记
     ---------------------------------------------------------------------- */
  function pageNotes() {
    const { site, notes } = state.data;
    const items = sortedByDate(notes.items);
    const tags = tagCounts(items);
    const latest = items[0];

    const chips = [
      `<button class="chip is-active" type="button" data-tag="全部">全部<span class="chip-count">${items.length}</span></button>`
    ]
      .concat(
        tags.slice(0, 12).map(
          ([tag, count]) =>
            `<button class="chip" type="button" data-tag="${esc(tag)}">${esc(tag)}<span class="chip-count">${count}</span></button>`
        )
      )
      .join('');

    const html = `<div class="wrap">
      <header class="page-head">
        <p class="eyebrow">02 / 学习笔记</p>
        <h1>学习笔记</h1>
        <p class="lede">${esc(notes.meta.description || '')}</p>
        <div class="page-meta">
          <span>${items.length} 篇</span>
          ${latest ? `<span>最近更新 ${fmtDate(latest.date)}</span>` : ''}
          <span>按时间倒序</span>
        </div>
      </header>

      <section class="toolbar" aria-label="笔记筛选">
        <label class="search">
          <span class="sr-only">搜索笔记</span>
          ${icon('search')}
          <input id="note-search" type="search" placeholder="搜标题、标签或关键词…" autocomplete="off">
        </label>
        <div class="chips" id="note-tags">${chips}</div>
      </section>

      <p class="list-note" id="note-count" aria-live="polite">共 ${items.length} 篇</p>
      <div class="note-list" id="note-list">
        ${items.map((note) => noteItemHtml(note)).join('')}
      </div>
      <p class="empty" id="note-empty" hidden>没有匹配的笔记。换个关键词，或者点「全部」看看。</p>
    </div>`;

    return {
      title: `学习笔记 · ${site.name}`,
      description: notes.meta.description || '',
      html,
      after: () => bindNotes(items)
    };
  }

  function bindNotes(items) {
    const input = $('#note-search');
    const list = $('#note-list');
    const empty = $('#note-empty');
    const count = $('#note-count');
    const chips = $$('#note-tags .chip');
    if (!list) return;

    let activeTag = '全部';

    const apply = () => {
      const query = (input ? input.value : '').trim().toLowerCase();
      const filtered = items.filter((note) => {
        const inTag = activeTag === '全部' || (note.tags || []).includes(activeTag);
        const haystack = [note.title, note.summary, ...(note.tags || [])]
          .join(' ')
          .toLowerCase();
        return inTag && (!query || haystack.includes(query));
      });

      list.innerHTML = filtered.map((note) => noteItemHtml(note)).join('');
      list.hidden = filtered.length === 0;
      if (empty) empty.hidden = filtered.length !== 0;
      if (count) {
        count.textContent =
          filtered.length === items.length
            ? `共 ${items.length} 篇`
            : `筛出 ${filtered.length} / ${items.length} 篇`;
      }
    };

    if (input) input.addEventListener('input', apply);

    chips.forEach((chip) => {
      chip.addEventListener('click', () => {
        activeTag = chip.dataset.tag || '全部';
        chips.forEach((item) => item.classList.toggle('is-active', item === chip));
        apply();
      });
    });
  }

  /* ----------------------------------------------------------------------
     10. 页面：项目
     ---------------------------------------------------------------------- */
  function pageProjects() {
    const { site, projects } = state.data;
    const items = sortedByDate(projects.items);
    const ongoing = items.filter((item) => item.status === '进行中').length;

    const html = `<div class="wrap">
      <header class="page-head">
        <p class="eyebrow">03 / 项目</p>
        <h1>项目</h1>
        <p class="lede">${esc(projects.meta.description || '')}</p>
        <div class="page-meta">
          <span>${items.length} 个项目</span>
          <span>${ongoing} 个进行中</span>
          <span>按时间倒序</span>
        </div>
      </header>

      <div class="project-grid">
        ${items.map((project, index) => projectCardHtml(project, index)).join('')}
      </div>

      <p class="page-note">
        ${icon('code')}
        <span>项目卡片只放「为什么做、怎么做、结果如何」。想跑一遍的话，点进仓库按 README 操作，环境和参数都有记录。</span>
      </p>
    </div>`;

    return {
      title: `项目 · ${site.name}`,
      description: projects.meta.description || '',
      html
    };
  }

  /* ----------------------------------------------------------------------
     11. 页面：成长时间线
     ---------------------------------------------------------------------- */
  function groupTimeline(items) {
    const years = new Map();

    items.forEach((item) => {
      const value = String(item.date || '');
      const year = value.slice(0, 4) || '—';
      const month = Number(value.slice(5, 7)) || 1;
      const quarter = Math.min(4, Math.max(1, Math.ceil(month / 3)));

      if (!years.has(year)) years.set(year, new Map());
      const quarters = years.get(year);
      if (!quarters.has(quarter)) quarters.set(quarter, []);
      quarters.get(quarter).push(item);
    });

    return [...years.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([year, quarters]) => ({
        year,
        quarters: [...quarters.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([quarter, list]) => ({ quarter, list }))
      }));
  }

  function pageTimeline() {
    const { site, timeline } = state.data;
    const items = sortedByDate(timeline.milestones);
    const groups = groupTimeline(items);
    const earliest = items.length ? String(items[items.length - 1].date || '').slice(0, 4) : '';

    const html = `<div class="wrap">
      <header class="page-head">
        <p class="eyebrow">04 / 成长时间线</p>
        <h1>成长时间线</h1>
        <p class="lede">${esc(timeline.meta.description || '')} 最近的在最前面。</p>
        <div class="page-meta">
          <span>${items.length} 个节点</span>
          ${earliest ? `<span>始于 ${esc(earliest)}</span>` : ''}
          <span>更新于 ${fmtDate(timeline.meta.updated || site.updated)}</span>
        </div>
      </header>

      <div class="timeline">
        ${groups
          .map(
            (group) => `<section class="tl-year" aria-label="${esc(group.year)} 年">
              <h2 class="tl-year-title">${esc(group.year)}</h2>
              ${group.quarters
                .map(
                  (entry) => `<section class="tl-quarter">
                    <h3 class="tl-quarter-title">
                      Q${entry.quarter}
                      <span class="tl-quarter-range">${(entry.quarter - 1) * 3 + 1}–${entry.quarter * 3} 月 · ${entry.list.length} 个节点</span>
                    </h3>
                    <ol class="tl-list">
                      ${entry.list
                        .map((item) => {
                          const type = typeClass(item.type);
                          const link = safeUrl(item.link);
                          return `<li class="tl-item" data-type="${type}" data-reveal>
                            <div class="tl-card">
                              <div class="tl-meta">
                                <span class="tl-month">${fmtMonth(item.date)}</span>
                                <span class="tl-type tl-type--${type}">${esc(item.type || '学习')}</span>
                              </div>
                              <h3>${esc(item.title)}</h3>
                              <p>${esc(item.detail || '')}</p>
                              ${link ? `<a class="text-link" href="${esc(link)}" target="_blank" rel="noopener">相关记录 ${icon('external', 'icon-sm')}</a>` : ''}
                            </div>
                          </li>`;
                        })
                        .join('')}
                    </ol>
                  </section>`
                )
                .join('')}
            </section>`
          )
          .join('')}
      </div>
    </div>`;

    return {
      title: `成长时间线 · ${site.name}`,
      description: timeline.meta.description || '',
      html
    };
  }

  /* ----------------------------------------------------------------------
     12. 页面：资源收藏
     ---------------------------------------------------------------------- */
  function pageResources() {
    const { site, resources } = state.data;
    const groups = resources.groups || [];
    const total = groups.reduce((sum, group) => sum + (group.items || []).length, 0);

    const html = `<div class="wrap">
      <header class="page-head">
        <p class="eyebrow">05 / 资源收藏</p>
        <h1>资源收藏</h1>
        <p class="lede">${esc(resources.meta.description || '')}</p>
        <div class="page-meta">
          <span>${total} 个入口</span>
          <span>${groups.length} 类</span>
          <span>更新于 ${fmtDate(resources.meta.updated || site.updated)}</span>
        </div>
      </header>

      <nav class="anchor-chips" aria-label="资源分类">
        ${groups
          .map(
            (group, index) =>
              `<a href="#/resources" data-scroll="res-${index}">${esc(group.category)}</a>`
          )
          .join('')}
      </nav>

      <div class="resource-groups">
        ${groups
          .map(
            (group, index) => `<section class="resource-group" id="res-${index}">
              <div class="resource-head">
                <h2>${esc(group.category)}</h2>
                <span>${(group.items || []).length} 个入口</span>
              </div>
              <div class="resource-grid">
                ${(group.items || [])
                  .map((resource) => {
                    const url = safeUrl(resource.url);
                    if (!url) {
                      return `<div class="resource-card">
                        <span class="res-top"><span class="res-name">${esc(resource.name)}</span></span>
                        <span class="res-desc">${esc(resource.desc || '')}</span>
                      </div>`;
                    }
                    return `<a class="resource-card" href="${esc(url)}" target="_blank" rel="noopener">
                      <span class="res-top">
                        <span class="res-name">${esc(resource.name)}</span>
                        <span class="res-arrow">${icon('external')}</span>
                      </span>
                      <span class="res-desc">${esc(resource.desc || '')}</span>
                      <span class="res-domain">${esc(hostname(url))}</span>
                    </a>`;
                  })
                  .join('')}
              </div>
            </section>`
          )
          .join('')}
      </div>
    </div>`;

    return {
      title: `资源收藏 · ${site.name}`,
      description: resources.meta.description || '',
      html
    };
  }

  /* ----------------------------------------------------------------------
     13. 路由与渲染
     ---------------------------------------------------------------------- */
  const PAGES = {
    home: pageHome,
    about: pageAbout,
    notes: pageNotes,
    projects: pageProjects,
    timeline: pageTimeline,
    resources: pageResources
  };

  function parseHash() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const [pathPart] = raw.split('?');
    const route = pathPart.replace(/\/+$/, '');
    return { route: ROUTES.includes(route) ? route : 'home' };
  }

  function setHead(title, description) {
    document.title = title;
    if (!description) return;

    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) metaDescription.setAttribute('content', description);

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute('content', title);

    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) ogDescription.setAttribute('content', description);
  }

  function updateNav(route) {
    $$('.nav a').forEach((link) => {
      if (link.dataset.nav === route) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  let firstRender = true;

  function renderRoute() {
    if (!state.data) return;

    const { route } = parseHash();
    const page = (PAGES[route] || PAGES.home)();

    app.innerHTML = page.html;
    setHead(page.title, page.description);
    updateNav(route);

    if (typeof page.after === 'function') page.after();

    initReveal();
    closeMenu();
    window.scrollTo({ top: 0, behavior: 'auto' });

    if (!firstRender) {
      try {
        app.focus({ preventScroll: true });
      } catch (error) {
        app.focus();
      }
    }
    firstRender = false;
  }

  /* ----------------------------------------------------------------------
     14. 滚动出现动画
     ---------------------------------------------------------------------- */
  let revealObserver = null;

  function initReveal() {
    const elements = $$('[data-reveal]');
    if (!elements.length) return;

    const reduceMotion =
      window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      elements.forEach((element) => element.classList.add('is-visible'));
      return;
    }

    if (revealObserver) revealObserver.disconnect();

    revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          revealObserver.unobserve(entry.target);
          // 动画结束后清掉延迟，避免影响卡片自己的 hover 过渡
          window.setTimeout(() => {
            entry.target.style.transitionDelay = '';
          }, 900);
        });
      },
      { rootMargin: '0px 0px -6% 0px', threshold: 0.04 }
    );

    elements.forEach((element, index) => {
      element.style.transitionDelay = `${Math.min(index % 5, 4) * 45}ms`;
      revealObserver.observe(element);
    });
  }

  /* ----------------------------------------------------------------------
     15. 页头交互：主题、菜单、复制
     ---------------------------------------------------------------------- */
  function syncThemeButton() {
    const toggle = $('#theme-toggle');
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
      /* 隐私模式下写不了 localStorage，忽略即可 */
    }
    syncThemeButton();
  }

  function closeMenu() {
    document.body.classList.remove('nav-open');
    const toggle = $('#menu-toggle');
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', '打开导航菜单');
    }
  }

  function bindChrome() {
    const themeToggle = $('#theme-toggle');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const next =
          document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
        setTheme(next);
      });
    }

    const menuToggle = $('#menu-toggle');
    if (menuToggle) {
      menuToggle.addEventListener('click', () => {
        const open = document.body.classList.toggle('nav-open');
        menuToggle.setAttribute('aria-expanded', String(open));
        menuToggle.setAttribute('aria-label', open ? '关闭导航菜单' : '打开导航菜单');
      });
    }

    $$('.nav a').forEach((link) => link.addEventListener('click', closeMenu));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenu();
    });

    document.addEventListener('click', (event) => {
      // 跳过导航：只移动焦点，不改 hash，否则会被当成路由切换
      const skipLink = event.target.closest('.skip-link');
      if (skipLink) {
        event.preventDefault();
        app.focus();
        app.scrollIntoView({ block: 'start' });
        return;
      }

      // 资源页的分类锚点：用滚动代替 hash，避免和 hash 路由冲突
      const scrollLink = event.target.closest('[data-scroll]');
      if (scrollLink) {
        event.preventDefault();
        const target = document.getElementById(scrollLink.dataset.scroll);
        if (target) {
          if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
          const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
            ? 'auto'
            : 'smooth';
          target.scrollIntoView({ behavior, block: 'start' });
        }
        return;
      }

      if (
        document.body.classList.contains('nav-open') &&
        !event.target.closest('.site-header')
      ) {
        closeMenu();
      }
    });

    const header = $('#site-header');
    const onScroll = () => {
      if (header) header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // 复制邮箱 / 微信号
    document.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-copy]');
      if (!button) return;

      const text = button.dataset.copy || '';
      try {
        await navigator.clipboard.writeText(text);
      } catch (error) {
        fallbackCopy(text);
      }

      const label = button.querySelector('span');
      const original = label ? label.textContent : '';
      button.classList.add('is-copied');
      if (label) label.textContent = '已复制';

      window.setTimeout(() => {
        button.classList.remove('is-copied');
        if (label) label.textContent = original || '复制';
      }, 1600);
    });

    const year = $('#footer-year');
    if (year) year.textContent = String(new Date().getFullYear());

    syncThemeButton();
  }

  function fallbackCopy(text) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    } catch (error) {
      /* 复制失败不阻塞页面 */
    }
  }

  /* ----------------------------------------------------------------------
     16. 加载失败提示
     ---------------------------------------------------------------------- */
  function renderError(error) {
    const isFile = location.protocol === 'file:' || (error && error.code === 'file-protocol');

    app.innerHTML = `<div class="wrap error-panel">
      <p class="eyebrow">数据加载失败</p>
      <h1>data/*.json 没有读出来</h1>
      <p>${
        isFile
          ? '你正在用「双击 HTML 文件」的方式打开页面。浏览器的安全策略不允许 file:// 页面读取本地 JSON，所以这里只能显示报错。'
          : '页面本身已经打开，但数据文件请求失败了，通常是路径或文件名不对。'
      }</p>

      <div class="error-card">
        <h2>本地预览（推荐）</h2>
        <p>在网站根目录启动一个静态服务器，然后访问提示的地址：</p>
        <pre>python -m http.server 8000</pre>
        <p>浏览器打开 <code>http://localhost:8000</code> 即可。</p>
      </div>

      <div class="error-card">
        <h2>已经部署到 GitHub Pages？</h2>
        <p>检查 <code>data/</code> 目录是否一起上传，文件名是否为小写的 <code>site.json</code>、<code>notes.json</code>、<code>projects.json</code>、<code>timeline.json</code>、<code>resources.json</code>，并确认 Pages 构建已经完成。</p>
      </div>

      <p class="error-detail">错误信息：${esc((error && error.message) || String(error))}</p>
    </div>`;

    setHead('数据加载失败 · 刘铭哲', '请通过本地服务器或 GitHub Pages 访问本站。');
  }

  /* ----------------------------------------------------------------------
     17. 启动
     ---------------------------------------------------------------------- */
  async function init() {
    bindChrome();

    try {
      await loadData();
    } catch (error) {
      renderError(error);
      return;
    }

    const site = state.data.site;

    // 用数据里的信息同步页头 / 页脚，避免两处维护
    const github = footerContact(site);
    const headerGithub = $('#header-github');
    if (github && headerGithub) headerGithub.href = safeUrl(github.href);

    const updated = $('#footer-updated');
    if (updated) updated.textContent = fmtDate(site.updated);

    renderRoute();

    window.addEventListener('hashchange', () => {
      const raw = (location.hash || '').replace(/^#\/?/, '').split('?')[0].replace(/\/+$/, '');
      // 页内锚点（例如 #app）不触发路由切换
      if (raw && !ROUTES.includes(raw)) return;
      renderRoute();
    });
  }

  init();
})();
