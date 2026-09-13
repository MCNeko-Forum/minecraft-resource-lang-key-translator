// 最小自检：stub DOM 加载 app.js 与官方术语表，验证统一入口架构、level.dat 解析回写与各解析器（node check.mjs）
import { readFileSync } from 'node:fs';
import { gzipSync, deflateSync, gunzipSync, inflateSync } from 'node:zlib';

const stub = () => ({ addEventListener() {}, classList: { toggle() {} }, style: {}, innerHTML: '', textContent: '', click() {}, open: false, value: '', dataset: {}, querySelectorAll: () => [], querySelector: () => null, removeAttribute() {}, setAttribute() {} });
globalThis.document = { getElementById: () => stub(), querySelectorAll: () => [], querySelector: () => null, documentElement: { classList: { toggle() {} } }, createElement: () => stub() };
globalThis.window = globalThis;
globalThis.window.addEventListener = () => {};
globalThis.location = { hash: '' };
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.pako = { ungzip: (b) => gunzipSync(b), inflate: (b) => inflateSync(b) };

// Node.js 环境下的压缩流辅助函数
globalThis.streamBytes = async (bytes, stream) => {
  if (stream.constructor.name === 'CompressionStream') {
    const format = stream.writable?.__format || 'gzip'; // stub：从构造参数推断
    return format === 'gzip' ? gzipSync(bytes) : deflateSync(bytes);
  }
  return bytes;
};
globalThis.CompressionStream = class CompressionStream {
  constructor(format) { this.writable = { __format: format }; }
};

const ok = (condition, message) => { if (!condition) throw new Error('自检失败：' + message); };
globalThis.ok = ok;
const officialSrc = readFileSync(new URL('./static/js/glossary-official.js', import.meta.url), 'utf8');
const src = readFileSync(new URL('./static/js/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./static/css/styles.css', import.meta.url), 'utf8');

// ===== 单文件模式（index.html）=====
ok(/id="file-input"/.test(html) && !/multiple/.test(html.match(/id="file-input"[^>]*>/)?.[0] || ''), '上传 input 应为单文件模式（无 multiple 属性）');
ok(/\.mcworld/.test(html) && /\.mctemplate/.test(html), '应支持世界文件格式');
ok(['service', 'scope', 'glossary', 'about'].every((v) => html.includes('value="' + v + '"')), '设置弹窗应有四个标签页（服务/范围/术语/关于）');
ok(['lang', 'manifest', 'signs', 'books', 'customNames', 'misc', 'npc', 'scripts', 'officialGlossary'].every((v) => html.includes('data-scope="' + v + '"')), '翻译范围应有 9 个开关（语言/清单/世界细分×4/NPC/脚本/官方术语）');
ok(['signs', 'books', 'customNames'].every((v) => new RegExp('data-scope="' + v + '"\\s+disabled').test(html)), '世界深层内容开关（告示牌/书/自定义名称）应禁用（LevelDB 不可改写）');
ok(!/data-scope="misc"[^>]*disabled/.test(html), '世界杂项开关应可用（世界名称可翻译）');
ok(html.includes('levelname.txt'), '应支持 levelname.txt 世界名同步');
ok(html.indexOf('glossary-official.js') < html.indexOf('app.js'), '官方术语数据应在 app.js 之前加载');
ok(html.includes('id="overwrite-dialog"') && html.includes('id="overwrite-confirm"'), '应有覆盖确认弹窗');
ok(!html.includes('id="batch-translate-dialog"') && !html.includes('id="confirm-dialog"'), '不应有批量翻译和删除确认弹窗（已改为单文件模式）');
// SEO 与外部资源
ok(/name="description"/.test(html) && /name="keywords"/.test(html) && /property="og:title"/.test(html) && /rel="icon"/.test(html), 'SEO 基础标签应齐备');
const ldJson = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)?.[1];
ok(ldJson && JSON.parse(ldJson)['@type'] === 'WebApplication', 'JSON-LD 应为合法 JSON 的 WebApplication');
ok((html.match(/cdn\.jsdmirror\.com/g) || []).length === 5, '应有 5 个外部资源引用 cdn.jsdmirror.com');
// ===== 样式 =====
ok(css.includes('.scope-row') && css.includes('.settings-tabs') && css.includes('.service-option'), '设置页标签/开关行/服务行样式应存在');
ok(css.includes('.settings-panel') && css.includes('.settings-panel[active]'), 'tab 面板样式应有默认隐藏与激活显示');
ok(css.includes(':root.mdui-theme-dark') && css.includes('--mdui-color-primary-light: 255, 165, 0'), '深色模式与品牌色 token 应保留');
ok(css.includes('min-width: 0') && css.includes('mdui-select::part(menu)'), '预览框溢出防护与下拉限高应保留');
// ===== 源码级断言 =====
ok(src.includes("classList.toggle('mdui-theme-dark')"), '主题切换应切换 MDUI 官方类 mdui-theme-dark');
ok(src.includes('ponytail:'), '脚本字符串启发式的已知局限应有 ponytail 注释');
ok(src.includes('state.item') && !src.includes('state.items'), 'state 应为单文件对象（state.item）而非数组（state.items）');
ok(src.includes('hasUnsavedChanges') && src.includes('beforeunload'), '应有未保存标记与 beforeunload 事件');
ok(src.includes('overwrite-dialog') || src.includes('overwrite-confirm'), '应有覆盖确认逻辑');
ok(src.includes('renderWorkspace') && src.includes("item.kind === 'lang'"), '应有单文件渲染函数区分 lang 和 archive');
ok(/window\.OFFICIAL_GLOSSARY/.test(officialSrc) && /"Diamond Sword", "钻石剑"/.test(officialSrc), '官方术语表应含 Diamond Sword → 钻石剑');

const checks = `
;(async function () {
  const eq = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const concat = (list) => { const out = new Uint8Array(list.reduce((n, c) => n + c.length, 0)); let p = 0; for (const c of list) { out.set(c, p); p += c.length; } return out; };
  // 构造原生（未压缩）level.dat：[int32 版本][int32 NBT 大小] + 小端 NBT（int / list / string / byte 字段 + LevelName）
  const buildRawLevel = (name) => {
    const enc = new TextEncoder();
    const nameBytes = enc.encode(name);
    const u16 = (n) => new Uint8Array([n & 255, n >> 8]);
    const i32 = (n) => new Uint8Array([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255]);
    const str = (s) => { const b = enc.encode(s); return concat([u16(b.length), b]); };
    const nbt = concat([
      new Uint8Array([10]), str(''),
      new Uint8Array([3]), str('GameType'), i32(1),
      new Uint8Array([9]), str('SpawnList'), new Uint8Array([5]), new Uint8Array([0, 0, 0, 0]),
      new Uint8Array([8]), str('LevelName'), u16(nameBytes.length), nameBytes,
      new Uint8Array([1]), str('Difficulty'), new Uint8Array([2]),
      new Uint8Array([0])
    ]);
    return concat([i32(10), i32(nbt.length), nbt]);
  };

  // ===== 语言表与工具函数 =====
  const bedrock = Object.keys(BEDROCK_LANGUAGES);
  ok(bedrock.length === 29, 'BEDROCK_LANGUAGES 应有 29 种语言，实际 ' + bedrock.length);
  ok(bedrock.every((k) => TRANSLATE_LANGUAGES[k]), 'BEDROCK_LANGUAGES 与 TRANSLATE_LANGUAGES 键应一致');
  ok(LANGUAGE_ALIASES.en_UK === 'en_GB' && normalizeLanguage('en_UK') === 'en_GB', 'en_UK 应映射到 en_GB');
  ok(fileLabel('zh_CN.lang', 'zh_CN') === 'zh_CN.lang（简体中文（中国大陆））' && fileLabel('custom.lang', null) === 'custom.lang', 'fileLabel 应输出“文件名（语言中文名）”，无语言时退回文件名');
  ok(stripExt('a.zip') === 'a' && stripExt('我的包.MCPACK') === '我的包' && stripExt('a.b.zip') === 'a.b', 'stripExt 应只剥掉下载后缀');
  ok(archiveExtOf('foo.mcpack.zip') === 'mcpack' && archiveExtOf('foo.mcpack (1)(2).zip') === 'mcpack' && archiveExtOf('foo.mcaddon（副本2）.zip') === 'mcaddon', '双后缀 + 副本标记应识别为对应扩展名');
  ok(archiveExtOf('foo.mcworld (1).zip') === 'mcworld' && archiveExtOf('bar.mctemplate.zip') === 'mctemplate' && packBaseName('foo.mcworld（2）.zip') === 'foo', '世界双后缀（mcworld/mctemplate）应识别');
  ok(archiveExtOf('my.mcpack.collection.zip') === 'zip' && archiveExtOf('x.rar') === 'zip' && packBaseName('plain.zip') === 'plain', '中间含点/未知后缀应回落 zip');
  ok(inferLanguage('en_US.lang') === 'en_US' && inferLanguage('readme.txt') === '', 'inferLanguage 应从文件名推断语言');

  // ===== parseLangText / exportLangText =====
  const parsed = parseLangText('## note\\na=x\\n\\nbad line');
  ok(parsed.filter(e => e.type === 'pair').length === 1 && parsed.find(e => e.type === 'pair')?.key === 'a', 'parseLangText 应提取键值对，注释与坏行保留');
  ok(parsed.some(e => e.type === 'invalid'), '无分隔符的行应标记为 invalid');


  // ===== level.dat 解析与回写 =====
  const raw = buildRawLevel('Old Name');
  const levelParsed = await parseLevelDat(raw);
  ok(levelParsed?.oldName === 'Old Name', '原生 level.dat 应解析出世界名称');
  const rebuilt = await buildLevelDat(levelParsed, '全新世界名称');
  const again = await parseLevelDat(rebuilt);
  ok(again.oldName === '全新世界名称', '回写后重新解析应得到新名称');
  ok(new DataView(rebuilt.buffer, rebuilt.byteOffset, rebuilt.byteLength).getInt32(4, true) === rebuilt.length - 8, '头部 NBT 大小字段应随名称长度更新');
  ok((await parseLevelDat(await buildLevelDat(await parseLevelDat(buildRawLevel('Very Long World Name Here')), 'W'))).oldName === 'W', '短名回写应正确收缩');
  ok(await parseLevelDat(new Uint8Array([0, 0, 0, 8, 0, 0, 0, 2, 9, 99, 99])) === null, '垃圾字节应解析失败返回 null');

  // gzip / zlib 嗅探与回写
  const gzRaw = await streamBytes(buildRawLevel('Gzip World'), new CompressionStream('gzip'));
  const gzParsed = await parseLevelDat(gzRaw);
  ok(gzParsed.oldName === 'Gzip World', 'gzip level.dat 应嗅探解压');
  const gzBack = await buildLevelDat(gzParsed, '压缩世界');
  ok(gzBack[0] === 0x1f && gzBack[1] === 0x8b && (await parseLevelDat(gzBack)).oldName === '压缩世界', 'gzip 输入回写后应保持 gzip 且名称正确');
  const zRaw = await streamBytes(buildRawLevel('Zlib World'), new CompressionStream('deflate'));
  const zParsed = await parseLevelDat(zRaw);
  ok(zParsed.oldName === 'Zlib World', 'zlib level.dat 应嗅探解压');
  ok((await parseLevelDat(await buildLevelDat(zParsed, '压缩世界'))).oldName === '压缩世界', 'zlib 回写后应可再解析');


  // ===== 压缩包内容解析器（NPC 对话和脚本）=====
  const dialogues = await parseDialogues({ files: {
    'dialogue/npc.json': { dir: false, async: async () => JSON.stringify({ 'minecraft:npc_dialogue': { scenes: [
      { npc_name: 'Old Man', text: { rawtext: [{ text: 'Hello there' }] }, buttons: [{ name: 'Tell me more' }] },
      { npc_name: { rawtext: [{ text: 'Raw Name' }] } }
    ] } }) },
    'other/plain.json': { dir: false, async: async () => '{"a":1}' }
  } });
  ok(dialogues.length >= 2, 'NPC 对话应提取文本和按钮名，非对话 JSON 跳过');
  ok(extractScriptLiterals("const a = 'single'; world.sendMessage('Hello there world'); const t = 'pct 100%';").length === 1, '脚本启发式应只收多词字符串（跳过标识符与含 % 的）');


  // ===== 术语匹配器：官方术语 zh_CN 且开关开启时启用 =====
  ok(Array.isArray(window.OFFICIAL_GLOSSARY) && window.OFFICIAL_GLOSSARY.length > 1500, '官方术语表应有 1500+ 条，实际 ' + (window.OFFICIAL_GLOSSARY?.length ?? 0));
  ok(['Sky', 'Light', 'Rose', 'Crops', 'Plum', 'Gold'].every((w) => !window.OFFICIAL_GLOSSARY.some(([en]) => en === w)), '官方术语应剔除歧义短词');
  const matchers = getGlossaryMatchers('zh_CN');
  ok(matchers.length > 1500, 'zh_CN 时应构建术语匹配器');
  ok(state.scope.officialGlossary === true, '官方术语开关默认应开启');
  ok(state.scope.misc === true && state.scope.signs === true && state.scope.books === true && state.scope.customNames === true, '世界细分开关（告示牌/书/自定义名称/杂项）应有默认状态');

  // ===== .lang 多语言翻译结果与打包下载 =====
  ok(langResultName('en_US.lang', 'zh_CN') === 'zh_CN.lang', '语言码格式文件名应直接替换语言码');
  ok(langResultName('custom_pack.lang', 'ja_JP') === 'custom_pack_ja_JP.lang', '非语言码文件名应追加语言码');
  ok(langResultName('notes.txt', 'zh_TW') === 'notes_zh_TW.txt', '.txt 结果应保持 .txt 后缀');
  ok(bundleDefaultName('en_US.lang') === 'en_US_translations', '打包默认文件名应为 原名_translations');
  // checks 经模板字面量 eval 执行，正则的反斜杠会被吃掉（\(\) 变分组、\[\] 变空字符类），文本断言一律用 includes 直查
  ok(__src.includes('data-result-download') && __src.includes('data-result-delete'), '翻译结果应有单文件下载与删除按钮');
  ok(__src.includes('id="bundle-download"') && __src.includes('打包下载'), '多语言结果应提供打包下载按钮');
  ok(__src.includes('translations.length >= 2'), '仅翻译了多个语言时才显示打包下载');
  ok(__src.includes('translations.findIndex(t => t.lang === targetLang)'), '同语言重复翻译应替换旧结果');
  ok(__src.includes('translations: []'), '原文 entries 不应被翻译覆盖（翻译结果独立存储）');

  console.log('自检通过：单文件模式、多语言翻译结果打包下载、level.dat 解析回写、NPC/脚本解析、官方术语表mai');
})().catch((error) => { console.error(error.message); process.exit(1); });`;

// 注：checks 在 eval 作用域内执行，访问不到模块局部变量，app.js 源码文本断言经 __src 提供
globalThis.__src = src;
(0, eval)(officialSrc + '\n' + src + '\n' + checks);
