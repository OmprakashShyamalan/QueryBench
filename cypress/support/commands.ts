/// <reference types="cypress" />
import { EditorView } from '@codemirror/view';
// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
//
// declare global {
//   namespace Cypress {
//     interface Chainable {
//       login(email: string, password: string): Chainable<void>
//       drag(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       dismiss(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       visit(originalFn: CommandOriginalFn, url: string, options: Partial<VisitOptions>): Chainable<Element>
//     }
//   }
// }

const normalizeSqlText = (value: string = '') => value.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trim();

const getCodeMirrorView = (root: HTMLElement) => {
	const elements = [root, ...Array.from(root.querySelectorAll('*'))];

	for (const element of elements) {
		const view = EditorView.findFromDOM(element as HTMLElement);
		if (view?.dispatch && view?.state?.doc) return view;
	}

	const fallback = root.closest('.cm-editor');
	if (fallback) {
		const view = EditorView.findFromDOM(fallback as HTMLElement);
		if (view?.dispatch && view?.state?.doc) return view;
	}

	return null;
};

Cypress.Commands.add('setCodeMirrorQuery', (query: string) => {
	cy.get('.cm-editor', { timeout: 10000 })
		.should('exist')
		.then(($editor) => {
			const view = getCodeMirrorView($editor.get(0));
			expect(view, 'CodeMirror editor view').to.exist;

			view.focus();
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: query },
				selection: { anchor: query.length },
			});

			expect(normalizeSqlText(view.state.doc.toString()), 'CodeMirror document value').to.equal(normalizeSqlText(query));
		});
});