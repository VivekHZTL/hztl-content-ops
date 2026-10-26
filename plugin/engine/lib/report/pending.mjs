// Pending categories with plain-words next steps. Used by reports (and by skills when they explain a run).
export const CATEGORIES = {
  placeholder: { title: 'Placeholder copy', next: 'Ask the client for the final text. The field is not written until the placeholder is gone.' },
  review: { title: 'Needs a look', next: 'A datasource was missing and replaced, or a component on the page is not in the content. Confirm the page still reads right after the write.' },
  'no-field': { title: 'No field for this value', next: 'Tell the developers: the content has a value the component cannot hold, or an SEO value with no page-field mapping.' },
  sources: { title: 'Source not registered', next: 'Register the file with sources register, then make a new dry run.' },
  'link-pending': { title: 'Link target not built yet', next: 'Build the target page, then run relink and a new dry run.' },
  other: { title: 'Other', next: 'Read the note and decide.' },
};
export const categoryInfo = (key) => CATEGORIES[key] || { title: key, next: CATEGORIES.other.next };
