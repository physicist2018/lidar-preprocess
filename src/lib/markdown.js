import MarkdownIt from 'markdown-it';
import DOMPurify from 'dompurify';

const md = new MarkdownIt({
	html: false,
	linkify: true,
	typographer: false
});

const defaultLinkOpen =
	md.renderer.rules.link_open ||
	((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

/** @param {any[]} tokens @param {number} idx @param {any} options @param {any} env @param {any} self */
function linkOpenRule(tokens, idx, options, env, self) {
	const token = tokens[idx];
	const href = token.attrGet('href') ?? '';

	if (href.startsWith('#') || href.startsWith('mailto:')) {
		return defaultLinkOpen(tokens, idx, options, env, self);
	}

	if (/^(https?:)?\/\//i.test(href)) {
		token.attrSet('target', '_blank');
		token.attrSet('rel', 'noopener noreferrer');
		return defaultLinkOpen(tokens, idx, options, env, self);
	}

	const page = href.split('#')[0].split('?')[0];
	if (page) {
		token.attrSet('data-wiki-page', page);
		token.attrSet('href', '#');
	}
	return defaultLinkOpen(tokens, idx, options, env, self);
}

md.renderer.rules.link_open = linkOpenRule;

/**
 * Рендерит markdown в санитизированный HTML.
 * @param {string} markdown
 * @returns {string}
 */
export function renderMarkdown(markdown) {
	return DOMPurify.sanitize(md.render(markdown));
}
