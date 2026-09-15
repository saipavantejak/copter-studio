/** Wilson score interval for an observed Bernoulli rate; not a physical safety guarantee. */
export function rateInterval(successes: number, attempts: number): [number, number] | null {
  if (!Number.isInteger(attempts) || attempts < 0 || !Number.isInteger(successes) || successes < 0 || successes > attempts) throw new Error('Invalid binomial counts');
  if (!attempts) return null;
  const z=1.959963984540054, p=successes/attempts, d=1+z*z/attempts;
  const center=(p+z*z/(2*attempts))/d;
  const half=z*Math.sqrt(p*(1-p)/attempts+z*z/(4*attempts*attempts))/d;
  return [Math.max(0,center-half),Math.min(1,center+half)];
}
