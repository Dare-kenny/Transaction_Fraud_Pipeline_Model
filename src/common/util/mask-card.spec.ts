import { maskCard } from './mask-card';

describe('maskCard', () => {
  it('keeps the first six and last four digits', () => {
    expect(maskCard('4111111111111111')).toBe('411111******1111');
  });

  it('strips separators before masking', () => {
    expect(maskCard('4000 0000-0000 0002')).toBe('400000******0002');
  });

  it('fully masks values too short to split safely', () => {
    expect(maskCard('1234567890')).toBe('**********');
  });

  it('never leaks the middle digits', () => {
    expect(maskCard('5500000000000004')).not.toContain('00000000');
  });
});
