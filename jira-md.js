const DEBOUNCE_DELAY = 300;

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('theme-toggle');
  const body = document.body;
  
  if (!toggle) {
    console.error('Toggle element not found');
    return;
  }
  
  chrome.storage.local.get(['theme'], (result) => {
    if (result.theme === 'light') {
      body.classList.add('light');
    }
  });
  
  toggle.addEventListener('click', () => {
    console.log('Toggle clicked');
    body.classList.toggle('light');
    const theme = body.classList.contains('light') ? 'light' : 'dark';
    console.log('Theme switched to:', theme);
    chrome.storage.local.set({ theme: theme });
  });
  
  initConverter();
});

let isConverting = false;

function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

function initConverter() {
  const jiraTextarea = document.getElementById('jira-md-jira-text');
  const markdownTextarea = document.getElementById('jira-md-markdown-text');
  
  if (!jiraTextarea || !markdownTextarea) {
    console.error('Textareas not found');
    return;
  }
  
  chrome.storage.local.get(['jiraText', 'markdownText'], (result) => {
    if (result.jiraText) {
      jiraTextarea.value = result.jiraText;
    }
    if (result.markdownText) {
      markdownTextarea.value = result.markdownText;
    }
  });
  
  const saveJiraText = debounce(() => {
    chrome.storage.local.set({ jiraText: jiraTextarea.value });
  }, DEBOUNCE_DELAY);
  
  const saveMarkdownText = debounce(() => {
    chrome.storage.local.set({ markdownText: markdownTextarea.value });
  }, DEBOUNCE_DELAY);
  
  const handleJiraInput = debounce(() => {
    if (isConverting) return;
    isConverting = true;
    const jiraText = jiraTextarea.value;
    const markdown = jiraToMarkdown(jiraText);
    markdownTextarea.value = markdown;
    saveJiraText();
    saveMarkdownText();
    isConverting = false;
  }, DEBOUNCE_DELAY);
  
  const handleMarkdownInput = debounce(() => {
    if (isConverting) return;
    isConverting = true;
    const markdownText = markdownTextarea.value;
    const jira = markdownToJira(markdownText);
    jiraTextarea.value = jira;
    saveMarkdownText();
    saveJiraText();
    isConverting = false;
  }, DEBOUNCE_DELAY);
  
  jiraTextarea.addEventListener('input', handleJiraInput);
  markdownTextarea.addEventListener('input', handleMarkdownInput);
}

function parseJiraMarkdown(text) {
  const lines = text.split('\n');
  const ast = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    
    if (/^h([1-6])\.\s+(.+)$/.test(line)) {
      const match = line.match(/^h([1-6])\.\s+(.+)$/);
      ast.push({ type: 'header', level: parseInt(match[1]), text: match[2] });
      i++;
      continue;
    }
    
    if (line.trim().startsWith('{code')) {
      const lang = line.match(/\{code:?([^}]*)\}/)?.[1] || '';
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('{code}')) {
        codeLines.push(lines[i]);
        i++;
      }
      ast.push({ type: 'code_block', lang: lang, content: codeLines.join('\n') });
      i++;
      continue;
    }
    
    if (line.trim().startsWith('{panel')) {
      const title = line.match(/title=([^}|]+)/)?.[1] || '';
      const panelLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('{panel}')) {
        panelLines.push(lines[i]);
        i++;
      }
      ast.push({ type: 'panel', title: title, content: panelLines.join('\n') });
      i++;
      continue;
    }
    
    if (line.startsWith('bq. ')) {
      ast.push({ type: 'quote', text: line.substring(4) });
      i++;
      continue;
    }
    
    if (line.match(/^\*+\s+/)) {
      const match = line.match(/^(\*+)\s+(.+)$/);
      const level = match[1].length;
      ast.push({ type: 'list_item', ordered: false, level: level, text: match[2] });
      i++;
      continue;
    }
    
    if (line.match(/^#+\s+/)) {
      const match = line.match(/^(#+)\s+(.+)$/);
      const level = match[1].length;
      ast.push({ type: 'list_item', ordered: true, level: level, text: match[2] });
      i++;
      continue;
    }
    
    if (line.trim()) {
      ast.push({ type: 'paragraph', text: line });
    } else {
      ast.push({ type: 'blank' });
    }
    i++;
  }
  
  return ast;
}

function parseMarkdown(text) {
  const lines = text.split('\n');
  const ast = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    
    if (/^#{1,6}\s+/.test(line)) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      ast.push({ type: 'header', level: match[1].length, text: match[2] });
      i++;
      continue;
    }
    
    if (line.trim().startsWith('```')) {
      const lang = line.trim().substring(3);
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      ast.push({ type: 'code_block', lang: lang, content: codeLines.join('\n') });
      i++;
      continue;
    }
    
    if (line.startsWith('> ')) {
      ast.push({ type: 'quote', text: line.substring(2) });
      i++;
      continue;
    }
    
    if (line.match(/^[\s]*[-*+]\s+/)) {
      const match = line.match(/^(\s*)([-*+])\s+(.+)$/);
      const level = Math.floor(match[1].length / 2) + 1;
      ast.push({ type: 'list_item', ordered: false, level: level, text: match[3] });
      i++;
      continue;
    }
    
    if (line.match(/^[\s]*\d+\.\s+/)) {
      const match = line.match(/^(\s*)\d+\.\s+(.+)$/);
      const level = Math.floor(match[1].length / 2) + 1;
      ast.push({ type: 'list_item', ordered: true, level: level, text: match[2] });
      i++;
      continue;
    }
    
    if (line.trim()) {
      ast.push({ type: 'paragraph', text: line });
    } else {
      ast.push({ type: 'blank' });
    }
    i++;
  }
  
  return ast;
}

function convertJiraInlineToMarkdown(text) {
  text = text.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '[$1]($2)');
  text = text.replace(/\*([^*]+)\*/g, '**$1**');
  text = text.replace(/_([^_]+)_/g, '*$1*');
  text = text.replace(/\{\{([^}]+)\}\}/g, '`$1`');
  text = text.replace(/(?<!\w)-([^-]+)-(?!\w)/g, '~~$1~~');
  
  return text;
}

function convertMarkdownInlineToJira(text) {
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '[$1|$2]');
  text = text.replace(/\*\*([^*]+)\*\*/g, '*$1*');
  text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '_$1_');
  text = text.replace(/`([^`]+)`/g, '{{$1}}');
  text = text.replace(/~~([^~]+)~~/g, '-$1-');
  
  return text;
}

function jiraAstToMarkdown(ast) {
  return ast.map(node => {
    switch (node.type) {
      case 'header':
        return '#'.repeat(node.level) + ' ' + convertJiraInlineToMarkdown(node.text);
      
      case 'code_block':
        return '```' + node.lang + '\n' + node.content + '\n```';
      
      case 'panel':
        const panelContent = node.content.split('\n')
          .map(line => '> ' + convertJiraInlineToMarkdown(line))
          .join('\n');
        const title = node.title ? `> **${node.title}**\n` : '';
        return title + panelContent;
      
      case 'quote':
        return '> ' + convertJiraInlineToMarkdown(node.text);
      
      case 'list_item':
        const indent = '  '.repeat(node.level - 1);
        const marker = node.ordered ? '1.' : '-';
        return indent + marker + ' ' + convertJiraInlineToMarkdown(node.text);
      
      case 'paragraph':
        return convertJiraInlineToMarkdown(node.text);
      
      case 'blank':
        return '';
      
      default:
        return '';
    }
  }).join('\n');
}

function markdownAstToJira(ast) {
  return ast.map(node => {
    switch (node.type) {
      case 'header':
        return 'h' + node.level + '. ' + convertMarkdownInlineToJira(node.text);
      
      case 'code_block':
        const lang = node.lang ? ':' + node.lang : '';
        return '{code' + lang + '}\n' + node.content + '\n{code}';
      
      case 'quote':
        return 'bq. ' + convertMarkdownInlineToJira(node.text);
      
      case 'list_item':
        const marker = node.ordered ? '#' : '*';
        return marker.repeat(node.level) + ' ' + convertMarkdownInlineToJira(node.text);
      
      case 'paragraph':
        return convertMarkdownInlineToJira(node.text);
      
      case 'blank':
        return '';
      
      default:
        return '';
    }
  }).join('\n');
}

function jiraToMarkdown(jiraText) {
  if (!jiraText.trim()) return '';
  const ast = parseJiraMarkdown(jiraText);
  return jiraAstToMarkdown(ast);
}

function markdownToJira(markdownText) {
  if (!markdownText.trim()) return '';
  const ast = parseMarkdown(markdownText);
  return markdownAstToJira(ast);
}
