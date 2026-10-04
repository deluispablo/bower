/**
 * What a task line is, for the screen that shows the boxes and for the
 * writer that ticks them, so both count tasks the same way: a bullet (- or
 * *) or a number (1.), then [ ] or [x].
 */
export const LIST_MARK = /^\s*([-*]|\d+\.)\s+/;
export const TASK_BOX = /^\[( |x)\]\s+/;
/** A whole task line: marker and opening bracket, the box, the rest, the label. */
export const TASK_LINE = /^(\s*(?:[-*]|\d+\.)\s+\[)( |x)(\]\s+)(.*)$/;
