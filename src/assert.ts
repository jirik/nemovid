import { Feature } from 'ol';
import type { FeatureLike } from 'ol/Feature';

export function assertIsDefined<T>(val: T): asserts val is NonNullable<T> {
  if (val === undefined || val === null) {
    throw new Error(`Expected 'val' to be defined, but received ${val}`);
  }
}

export function assertFeature(val: FeatureLike): asserts val is Feature {
  if (!(val instanceof Feature)) {
    throw new Error(
      `Expected 'val' to be instance of ${Feature}, but is instance of ${typeof val}`,
    );
  }
}
export function assertFeatures(val: FeatureLike[]): asserts val is Feature[] {
  // @ts-ignore
  for (const v of val) {
    assertFeature(v);
  }
}
