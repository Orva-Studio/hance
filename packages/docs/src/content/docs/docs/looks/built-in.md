---
title: Built-in Looks
description: The 40+ film stock looks that ship with hance.
---

Hance ships with looks modeled after real film stocks. Apply any with `--preset <name>`.

## Color negative

| Look | Film stock |
|------|-----------|
| `colorplus-200` | Kodak ColorPlus 200 |
| `ektar-100` | Kodak Ektar 100 |
| `fuji-pro-400h` | Fuji Pro 400H |
| `fujicolor-200` | Fujicolor C200 |
| `gold-200` | Kodak Gold 200 |
| `ilfocolor-400` | Ilford Ilfocolor 400 |
| `lomo-color-100` | Lomography Color Negative 100 |
| `portra-400` | Kodak Portra 400 |
| `portra-800` | Kodak Portra 800 |
| `proimage-100` | Kodak ProImage 100 |
| `superia-400` | Fuji Superia 400 |
| `ultramax-400` | Kodak Ultramax 400 |
| `vista-200` | Agfa Vista 200 |
| `vista-400` | Agfa Vista 400 |
| `venus-800` | Lomography Color Negative 800 |

## Slide / reversal

| Look | Film stock |
|------|-----------|
| `ektachrome` | Kodak Ektachrome |
| `kodachrome-64` | Kodak Kodachrome 64 |
| `provia-100f` | Fuji Provia 100F |
| `velvia-50` | Fuji Velvia 50 |
| `acros-100ii` | Fuji Acros 100 II |

## Black & white

| Look | Film stock |
|------|-----------|
| `delta-3200` | Ilford Delta 3200 |
| `fomapan-400` | Foma Fomapan 400 |
| `hp5` | Ilford HP5 Plus |
| `ortho-80` | Rollei Ortho 80 |
| `sfx-200` | Ilford SFX 200 |
| `streetpan-400` | Silberra Streetpan 400 |
| `tri-x-400` | Kodak Tri-X 400 |
| `xp2-400` | Ilford XP2 Super 400 |
| `cinestill-bwxx` | CineStill BwXX |

## Cinema

| Look | Film stock |
|------|-----------|
| `cinestill-50d` | CineStill 50D |
| `cinestill-400d` | CineStill 400D |
| `cinestill-800t` | CineStill 800T |
| `vision3-250d` | Kodak Vision3 250D |
| `vision3-500t` | Kodak Vision3 500T |

## Specialty

| Look | Description |
|------|-------------|
| `aerocolor-100` | Kodak Aerocolor (aerial photography film) |
| `bleach-bypass` | Bleach bypass processing effect |
| `centuria-200` | Konica Centuria 200 |
| `holga-400` | Holga toy camera aesthetic |
| `lomography-redscale` | Lomography Redscale |
| `polaroid-sx70` | Polaroid SX-70 |

## Usage

```bash
hance video.mp4 --preset cinestill-800t
hance video.mp4 --preset portra-400 --grain-iso 1000
```

List all available looks:

```bash
hance preset list
```
