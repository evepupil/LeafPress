/**
 * 复制页模板：样式和脚本，照作者原件 `知乎发布稿.html` 移植（只读参考，不改原件）。
 * - 样式：顶部工具栏、700px 正文卡片、figure 与图工具栏；
 * - 脚本：mermaid 渲染（cdnjs 10.9.1，htmlLabels 关掉）、每张图的「复制这张图」「下载 PNG」、
 *   「复制正文」把每个 figure 换成占位行，text/html 和 text/plain 双格式写剪贴板，带 execCommand 降级。
 * 这里只放静态字符串，拼页面的逻辑在 copy-page.ts。
 */

export const COPY_PAGE_STYLES = `
  :root { color-scheme: light; }
  body { margin: 0; background: #f6f6f6; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif; color: #1a1a1a; }
  .bar { position: sticky; top: 0; z-index: 10; background: #fff; border-bottom: 1px solid #e4e4e4; padding: 12px 20px; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .bar button { background: #056de8; color: #fff; border: 0; border-radius: 4px; padding: 8px 18px; font-size: 14px; cursor: pointer; }
  .bar button:hover { background: #0451ad; }
  .bar span { font-size: 13px; color: #8590a6; }
  .wrap { max-width: 700px; margin: 24px auto 80px; background: #fff; padding: 40px 44px 56px; border-radius: 4px; }
  #zhihu-body { font-size: 16px; line-height: 1.78; color: #1a1a1a; }
  #zhihu-body h1 { font-size: 24px; line-height: 1.4; margin: 0 0 24px; }
  #zhihu-body h2 { font-size: 20px; margin: 38px 0 14px; line-height: 1.4; }
  #zhihu-body h3 { font-size: 17px; margin: 28px 0 10px; line-height: 1.4; }
  #zhihu-body p { margin: 0 0 18px; }
  #zhihu-body strong { font-weight: 600; }
  #zhihu-body code { background: #f6f6f6; border-radius: 3px; padding: 1px 5px; font-family: Consolas, Monaco, monospace; font-size: 14px; color: #c7254e; }
  #zhihu-body table { border-collapse: collapse; width: 100%; margin: 0 0 18px; font-size: 15px; }
  #zhihu-body th, #zhihu-body td { border: 1px solid #e4e4e4; padding: 8px 12px; text-align: left; vertical-align: top; }
  #zhihu-body th { background: #fafafa; font-weight: 600; }
  #zhihu-body ul { margin: 0 0 18px; padding-left: 22px; }
  #zhihu-body li { margin-bottom: 6px; }
  #zhihu-body a { color: #056de8; text-decoration: none; }
  #zhihu-body figure.fig { margin: 0 0 22px; padding: 16px 12px 10px; border: 1px dashed #dcdcdc; border-radius: 6px; background: #fff; }
  #zhihu-body figure.fig pre.mermaid { background: #fff; text-align: center; margin: 0; padding: 0; }
  #zhihu-body figure.fig img { max-width: 100%; height: auto; }
  .figbar { display: flex; align-items: center; gap: 10px; margin-top: 12px; padding-top: 10px; border-top: 1px solid #f0f0f0; }
  .figbar button { background: #fff; color: #056de8; border: 1px solid #056de8; border-radius: 4px; padding: 5px 12px; font-size: 13px; cursor: pointer; }
  .figbar button:hover { background: #f0f6ff; }
  .figbar .figmsg { font-size: 12px; color: #8590a6; }
`.trim();

export const MERMAID_CDN =
  "https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js";

export const COPY_PAGE_SCRIPT = `
(function () {
  var FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

  function setMsg(el, text, revert) {
    el.textContent = text;
    if (revert !== false) {
      clearTimeout(el._t);
      el._t = setTimeout(function () { el.textContent = ''; }, 4000);
    }
  }

  // 把渲染好的 SVG 转成 PNG blob。htmlLabels 关掉之后 SVG 里只有 <text>，canvas 能正常画。
  function svgToPng(svg, scale) {
    return new Promise(function (resolve, reject) {
      var rect = svg.getBoundingClientRect();
      var w = Math.ceil(rect.width) || 800;
      var h = Math.ceil(rect.height) || 400;

      var clone = svg.cloneNode(true);
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      clone.setAttribute('width', w);
      clone.setAttribute('height', h);
      clone.style.maxWidth = 'none';
      clone.style.fontFamily = FONT;

      var data = new XMLSerializer().serializeToString(clone);
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        canvas.width = w * scale;
        canvas.height = h * scale;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(function (blob) {
          blob ? resolve(blob) : reject(new Error('toBlob 返回空'));
        }, 'image/png');
      };
      img.onerror = function () { reject(new Error('SVG 载入失败')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(data);
    });
  }

  // 有 <svg> 的图（mermaid 渲染出来）用 canvas 转；内嵌图片用 Blob 转。
  function figToBlob(fig) {
    var svg = fig.querySelector('svg');
    if (svg) return svgToPng(svg, 2);
    var img = fig.querySelector('img');
    if (!img || !/^data:image\\/(png|jpeg|jpg|gif|webp);base64,/i.test(img.src))
      return Promise.reject(new Error('这张图不是内嵌图片'));
    return fetch(img.src)
      .then(function (response) { return response.blob(); })
      .then(function (blob) { return new Promise(function (resolve, reject) {
        if (blob.type === 'image/png') return resolve(blob);
        // 复制要 PNG：把别的格式画到白底 canvas 上再导出
        var url = URL.createObjectURL(blob);
        var el = new Image();
        el.onload = function () {
          var canvas = document.createElement('canvas');
          canvas.width = el.naturalWidth * 2;
          canvas.height = el.naturalHeight * 2;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          canvas.toBlob(function (png) {
            png ? resolve(png) : reject(new Error('转 PNG 失败'));
          }, 'image/png');
        };
        el.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片载入失败')); };
        el.src = url;
      }); });
  }

  function buildFigBars() {
    var figs = document.querySelectorAll('#zhihu-body figure.fig');
    Array.prototype.forEach.call(figs, function (fig, i) {
      var title = fig.getAttribute('data-title') || ('图 ' + (i + 1));
      fig.setAttribute('data-index', String(i + 1));

      var bar = document.createElement('div');
      bar.className = 'figbar';

      var label = document.createElement('span');
      label.className = 'figmsg';
      label.textContent = '图 ' + (i + 1) + ' · ' + title;

      var copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = '复制这张图';

      var down = document.createElement('button');
      down.type = 'button';
      down.textContent = '下载 PNG';

      var msg = document.createElement('span');
      msg.className = 'figmsg';

      bar.appendChild(label);
      bar.appendChild(copy);
      bar.appendChild(down);
      bar.appendChild(msg);
      fig.appendChild(bar);

      copy.addEventListener('click', function () {
        figToBlob(fig).then(function (blob) {
          return navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        }).then(function () {
          setMsg(msg, '已复制，去知乎粘贴');
        }).catch(function (err) {
          setMsg(msg, '复制失败：' + err.message + '，改用下载');
        });
      });

      down.addEventListener('click', function () {
        figToBlob(fig).then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = '图' + (i + 1) + '-' + title + '.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
          setMsg(msg, '已下载');
        }).catch(function (err) {
          setMsg(msg, '导出失败：' + err.message);
        });
      });
    });
  }

  if (window.mermaid) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      fontFamily: FONT,
      flowchart: { htmlLabels: false, useMaxWidth: false }
    });
    mermaid.run({ querySelector: '#zhihu-body pre.mermaid' })
      .then(buildFigBars)
      .catch(function () { buildFigBars(); });
  } else {
    buildFigBars();
  }

  // 正文复制：把每个 figure 换成占位行，SVG 和按钮都不会进剪贴板
  document.getElementById('copyBtn').addEventListener('click', async function () {
    var hint = document.getElementById('hint');
    var idle = '正文里的图会变成占位行，再用每张图下面的按钮单独复制图片粘上去';

    var clone = document.getElementById('zhihu-body').cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll('figure.fig'), function (fig, i) {
      var title = fig.getAttribute('data-title') || '';
      var ph = document.createElement('p');
      ph.textContent = '【图 ' + (i + 1) + ' · ' + title + '：在这里粘贴图片】';
      fig.parentNode.replaceChild(ph, fig);
    });

    try {
      var blobHtml = new Blob([clone.innerHTML], { type: 'text/html' });
      var blobText = new Blob([clone.innerText], { type: 'text/plain' });
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': blobHtml, 'text/plain': blobText })]);
      hint.textContent = '正文已复制，粘贴后按占位行插图';
    } catch (e) {
      var holder = document.createElement('div');
      holder.style.position = 'fixed';
      holder.style.left = '-99999px';
      holder.appendChild(clone);
      document.body.appendChild(holder);
      var range = document.createRange();
      range.selectNodeContents(clone);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('copy');
      sel.removeAllRanges();
      document.body.removeChild(holder);
      hint.textContent = '正文已复制，粘贴后按占位行插图';
    }
    setTimeout(function () { hint.textContent = idle; }, 5000);
  });
})();
`.trim();
