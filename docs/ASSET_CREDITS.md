# Third-party asset provenance

Gami Engine keeps external runtime assets replaceable through the scene manifest. These files do not define collision, AI identity, interaction, scale, or saved state.

| Runtime files | Source | License | Gami modifications |
| --- | --- | --- | --- |
| `public/assets/characters/quaternius/gami-base-male.*` and character textures | [Quaternius Universal Base Characters](https://quaternius.com/packs/universalbasecharacters.html) | CC0 1.0; bundled as `LICENSE-BASE-CHARACTERS.txt` | Selected the free standard male base, resized 2K textures to 1K, runtime material variants and separate equipment/hair |
| `public/assets/characters/quaternius/gami-animation-library.*` | [Quaternius Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) | CC0 1.0; bundled as `LICENSE-ANIMATIONS.txt` | Kept only demo-required clips; runtime remaps rotations to the character skeleton and rejects source translations so Gami owns root motion and body proportions |

The procedural sectioned humanoid remains the renderer-safe missing-asset fallback. It is not evidence that the authored glTF path loaded successfully.
