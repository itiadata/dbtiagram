import { describe, expect, it } from 'vitest';
import { generateStaticSite } from '../../../src/static/generate';
describe('static generator', () => { it('exports the generation entry point', () => expect(typeof generateStaticSite).toBe('function')); });
