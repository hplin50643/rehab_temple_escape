const shapes = {
  bluetooth: '<path d="m7 7 10 10-5 4V3l5 4L7 17"/>',
  play: '<path d="m7.5 4.7 12 7.3-12 7.3z"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  book: '<path d="M12 6c-3-2-6-2.4-9-1v14c3-1.4 6-1 9 1 3-2 6-2.4 9-1V5c-3-1.4-6-1-9 1Zm0 0v14"/>',
  volume: '<path d="m11 5-5 4H3v6h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 5-5 4H3v6h3l5 4zM16 9l5 6m0-6-5 6"/>',
  expand: '<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>',
  shrink: '<path d="M3 8h5V3m8 0v5h5m0 8h-5v5m-8 0v-5H3"/>',
  settings: '<path d="m10 3-.6 2.1-2.1 1.2-2.2-.5L3 9.3l1.6 1.6v2.2L3 14.7l2.1 3.5 2.2-.5 2.1 1.2L10 21h4l.6-2.1 2.1-1.2 2.2.5 2.1-3.5-1.6-1.6v-2.2L21 9.3l-2.1-3.5-2.2.5-2.1-1.2L14 3z"/><circle cx="12" cy="12" r="3.2"/>',
  route: '<circle cx="6" cy="17" r="2.3"/><circle cx="18" cy="6" r="2.3"/><path d="M8.3 17H15a3 3 0 0 0 0-6H9a2.5 2.5 0 0 1 0-5h6.7"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  gauge: '<path d="M3 17a9 9 0 1 1 18 0l-2 2H5zm9-3 4-5"/><circle cx="12" cy="15" r="1"/>',
  gem: '<path d="m12 2 9 10-9 10L3 12z"/><path d="m12 7 4.5 5-4.5 5-4.5-5Z"/>',
  jump: '<path d="M3 17h4m10 0h4M5 14a7.8 7.8 0 0 1 14-4m0-4 .8 4.5-4.5.7"/>',
  slide: '<path d="M3 6h18M6 14l5 3h9M9 11l5 2 3-3"/><circle cx="7" cy="11" r="2"/>',
  footprint: '<path d="M9 4c-3-1-5 2-5 5 0 2 1 4 3 4s3-2 4-5c.4-2-.1-3.5-2-4zm-2 12-1 4m11-10c3-1 5 2 4.5 5-.4 2-1.4 3.5-3 3.5-2 0-3-2-3-4.5 0-2 .2-3.3 1.5-4zm1 11-.4 1"/>',
} as const;
export type IconName = keyof typeof shapes;
export function setIcon(element: HTMLElement, name: IconName) {
  element.dataset.icon = name;
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" focusable="false">' + shapes[name] + '</svg>';
}
export function fillIcons(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('i[data-icon]').forEach(element => {
    const name = element.dataset.icon as IconName;
    if (shapes[name]) setIcon(element, name);
  });
}
