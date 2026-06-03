export const clip = (text: string, max = 4000) =>
  text.length <= max ? text : text.slice(0, max) + '\n…[truncated]';

export const replyMd = async (
  ctx: { reply: (t: string, o?: object) => Promise<unknown> },
  text: string
) => {
  try {
    return await ctx.reply(text, {
      parse_mode: "Markdown",
    });
  } catch (err) {
    console.error("Markdown failed, sending plain text", err);

    return await ctx.reply(text);
  }
};

/** Text after `/name …` */
export function commandArg(fullText: string, name: string): string {
  return fullText.replace(new RegExp(`^/${name}\\s*`, 'i'), '').trim();
}