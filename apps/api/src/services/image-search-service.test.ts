import { describe, expect, it } from "vitest"
import { cosineSimilarity, featureJsonToVector } from "./image-search-service.js"

const features = {
  description: "蓝色海面上的白色帆船",
  scene: { outdoor: 1, indoor: 0, nature: .8, urban: 0, abstract: 0 },
  subject: { person: 0, animal: 0, plant: 0, food: 0, vehicle: .7, building: 0, object: .4, landscape: .8, water: 1, sky: .8 },
  color: { red: 0, orange: 0, yellow: .1, green: .1, blue: 1, purple: 0, pink: 0, brown: .1, white: .5, black: 0, gray: .1, colorful: .4, monochrome: 0 },
  style: { photo_realistic: 1, illustration: 0, painting: 0, minimalist: .4, detailed: .7, dark: 0, bright: .8, warm: .2, cool: .9, vintage: 0, modern: .5 },
  mood: { calm: .9, energetic: .2, dramatic: .2, cheerful: .5, melancholic: .1, mysterious: .1, romantic: .4, tense: 0 },
  composition: { close_up: 0, wide_shot: 1, portrait: 0, landscape_orientation: 1, symmetrical: .3, busy: .2, simple: .7 },
  time: { daytime: 1, nighttime: 0, sunrise_sunset: 0, indoor_lit: 0 },
  texture: { smooth: .7, rough: .1, soft: .3, shiny: .4, matte: .2, transparent: .2 },
}

describe("image search vector", () => {
  it("creates a normalized fixed 64-dimensional vector", () => {
    const vector = featureJsonToVector(features)
    expect(vector).toHaveLength(64)
    expect(Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0))).toBeCloseTo(1)
  })

  it("returns one for identical vectors", () => {
    const vector = featureJsonToVector(features)
    expect(cosineSimilarity(vector, vector)).toBeCloseTo(1)
  })

  it("rejects mismatched or empty vectors", () => {
    expect(cosineSimilarity([1, 0], [1])).toBe(0)
    expect(cosineSimilarity([], [])).toBe(0)
  })
})
