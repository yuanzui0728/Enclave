import {
  enforceTurnAlternation,
  hasContactLeak,
  sanitizeTranscriptTurns,
} from './transcript-sanitizer';

// 分身相遇脚本清洗 + 一来一回保证 + 联系方式泄漏扫描（含「微信号 xxx」常见写法）。
describe('transcript-sanitizer', () => {
  describe('hasContactLeak', () => {
    it('catches 微信/微信号 with id and other contact forms', () => {
      expect(hasContactLeak('微信号 abcd123')).toBe(true);
      expect(hasContactLeak('微信号abcd123')).toBe(true);
      expect(hasContactLeak('加我微信 vx_99')).toBe(true);
      expect(hasContactLeak('13800138000')).toBe(true);
      expect(hasContactLeak('a@b.com')).toBe(true);
      expect(hasContactLeak('https://t.me/x')).toBe(true);
    });
    it('does not flag normal chatter (no false positive on 微信支付)', () => {
      expect(hasContactLeak('我平时用微信支付买咖啡')).toBe(false);
      expect(hasContactLeak('随便聊聊天气和电影')).toBe(false);
    });
  });

  describe('enforceTurnAlternation', () => {
    it('merges consecutive same-speaker turns into one bubble (keeps content)', () => {
      const merged = enforceTurnAlternation([
        { speaker: 'initiator', text: '你好' },
        { speaker: 'initiator', text: '在忙吗' },
        { speaker: 'recipient', text: '还好' },
        { speaker: 'initiator', text: '聊聊' },
      ]);
      expect(merged).toEqual([
        { speaker: 'initiator', text: '你好 在忙吗' },
        { speaker: 'recipient', text: '还好' },
        { speaker: 'initiator', text: '聊聊' },
      ]);
    });

    it('collapses an all-one-speaker (degenerate) transcript to a single speaker', () => {
      const merged = enforceTurnAlternation([
        { speaker: 'initiator', text: 'a' },
        { speaker: 'initiator', text: 'b' },
        { speaker: 'initiator', text: 'c' },
      ]);
      expect(merged).toHaveLength(1);
      // 调用方据此（speakers.size<2）判退化脚本失败。
      expect(new Set(merged.map((t) => t.speaker)).size).toBe(1);
    });
  });

  it('sanitizeTranscriptTurns drops leaked turns + non-turn rows', () => {
    const turns = sanitizeTranscriptTurns([
      { speaker: 'initiator', text: '正常一句' },
      { speaker: 'recipient', text: '我的微信号 contact88' }, // 泄漏 → 丢
      { speaker: 'narrator', text: '旁白' }, // 非法 speaker → 丢
      { speaker: 'recipient', text: '(笑) 好啊' }, // 旁白剥除后保留「好啊」
    ]);
    expect(turns).toEqual([
      { speaker: 'initiator', text: '正常一句' },
      { speaker: 'recipient', text: '好啊' },
    ]);
  });
});
