import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import type { Rating } from '../lib/store';
import { colors } from '../theme';
import { RatingIcon } from './ui';

// ---------- Illustrated product packaging (no third-party brand art) ----------
export type DemoProduct = {
  id: string;
  name: string;
  brand: string;
  emoji: string;
  color: string;
  accent: string;
  ingredients: string[];
};

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: 'plantain',
    name: 'Sunny Organic Plantain Chips Kettle Cooked',
    brand: 'SUNNY',
    emoji: '🍌',
    color: '#FDE2EC',
    accent: '#E8447A',
    ingredients: ['Banana', 'Coconut oil', 'Sea salt'],
  },
  {
    id: 'granola',
    name: 'Goodgrain Chocolate Chip Banana Granola Bars',
    brand: 'GOOD\nGRAIN',
    emoji: '🍫',
    color: '#FFD84D',
    accent: '#B4122B',
    ingredients: ['Oats', 'Banana', 'Chocolate', 'Honey', 'Sunflower oil', 'Sea salt'],
  },
  {
    id: 'bread',
    name: "Hearth Baker's 100% Whole Wheat Thin-Sliced",
    brand: 'HEARTH',
    emoji: '🍞',
    color: '#E9DDF7',
    accent: '#5B3A8E',
    ingredients: ['Whole wheat flour', 'Water', 'Cane sugar', 'Wheat gluten', 'Yeast', 'Sea salt', 'Vinegar'],
  },
  {
    id: 'pretzels',
    name: 'Crunchies Gluten Free Yogurt Covered Pretzels',
    brand: 'CRUNCHIES',
    emoji: '🥨',
    color: '#CFF3F1',
    accent: '#138C8A',
    ingredients: ['Sugar', 'Palm oil', 'Corn starch', 'Potato starch', 'Yogurt', 'Soy lecithin', 'Natural flavor', 'Salt'],
  },
  {
    id: 'icecream',
    name: 'Market Strawberry Ice Cream - 1.5qt',
    brand: 'MARKET',
    emoji: '🍓',
    color: '#FFE3E3',
    accent: '#D7263D',
    ingredients: [
      'Milk',
      'Cream',
      'Sugar',
      'Corn syrup',
      'Strawberry',
      'Natural flavor',
      'Mono and diglycerides',
      'Guar gum',
      'Red 40',
      'Blue 1',
      'Carrageenan',
    ],
  },
  {
    id: 'oatmilk',
    name: 'Daily Barista Oat Milk Original',
    brand: 'OAT\nDAILY',
    emoji: '🥛',
    color: '#E4EEFB',
    accent: '#1F4E9C',
    ingredients: ['Oats', 'Water', 'Rapeseed oil', 'Calcium carbonate', 'Sea salt'],
  },
  {
    id: 'salsa',
    name: 'Casa Roja Medium Chunky Tomato Salsa',
    brand: 'CASA\nROJA',
    emoji: '🍅',
    color: '#FFE8D6',
    accent: '#C2410C',
    ingredients: ['Tomato', 'Onion', 'Bell pepper', 'Cayenne pepper', 'Vinegar', 'Garlic', 'Salt'],
  },
  {
    id: 'pb',
    name: 'Nutty Farms Creamy Peanut Butter No Sugar Added',
    brand: 'NUTTY',
    emoji: '🥜',
    color: '#F6E7C8',
    accent: '#7C4A12',
    ingredients: ['Peanut', 'Sea salt'],
  },
  {
    id: 'crackers',
    name: 'Simple Seed Almond Flour Crackers Sea Salt',
    brand: 'SIMPLE',
    emoji: '🍘',
    color: '#FFF4D6',
    accent: '#2D7A3E',
    ingredients: ['Almond flour', 'Sunflower seeds', 'Flaxseed', 'Tapioca', 'Sea salt'],
  },
];

export function Package({ p, size = 120 }: { p: DemoProduct; size?: number }) {
  return (
    <View style={[pk.pack, { width: size * 0.72, height: size * 0.9, backgroundColor: p.color, borderColor: p.accent }]}>
      <Text style={[pk.brand, { color: p.accent, fontSize: size * 0.1 }]} numberOfLines={2}>
        {p.brand}
      </Text>
      <Text style={{ fontSize: size * 0.32 }}>{p.emoji}</Text>
    </View>
  );
}

export function ProductTile({
  p,
  rating = 'green',
  saved,
  compact,
}: {
  p: DemoProduct;
  rating?: Rating;
  saved?: boolean;
  compact?: boolean;
}) {
  return (
    <View style={{ flex: 1 }}>
      <View style={[pk.tile, compact && { height: 108 }]}>
        <Package p={p} size={compact ? 100 : 130} />
        <View style={pk.tileStatus}>
          <RatingIcon rating={rating} size={compact ? 18 : 24} />
        </View>
        <View style={pk.tileSave}>
          <Feather name="bookmark" size={compact ? 11 : 16} color={saved ? colors.purple : '#555'} />
        </View>
      </View>
      <Text style={[pk.tileName, compact && { fontSize: 9, lineHeight: 12 }]} numberOfLines={2}>
        {p.name}
      </Text>
    </View>
  );
}

// ---------- Phone mockup used on the welcome screen ----------
export function PhoneMockup({ style }: { style?: ViewStyle }) {
  return (
    <View style={[pk.phone, style]}>
      <View style={pk.phoneInner}>
        <View style={pk.phoneStatus}>
          <Text style={pk.phoneTime}>9:41</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Feather name="bar-chart-2" size={10} />
            <Feather name="wifi" size={10} />
            <Feather name="battery" size={11} />
          </View>
        </View>
        <View style={pk.phoneSearchRow}>
          <View style={pk.phoneSearch}>
            <Feather name="search" size={10} color="#666" />
            <Text style={pk.phoneSearchText}>Search for a product</Text>
          </View>
          <Feather name="bell" size={13} />
        </View>
        <View style={pk.phoneFilters}>
          <View style={pk.phoneFilter}>
            <RatingIcon rating="green" size={11} />
            <Text style={pk.phoneFilterText}>Likely Works</Text>
          </View>
          <View style={pk.phoneFilter}>
            <Text style={pk.phoneFilterText}>All Tapis</Text>
          </View>
          <View style={pk.phoneFilter}>
            <Text style={pk.phoneFilterText}>Store</Text>
          </View>
          <View style={pk.phoneFilter}>
            <Text style={pk.phoneFilterText}>Category</Text>
          </View>
        </View>
        <View style={pk.phoneGrid}>
          <ProductTile p={DEMO_PRODUCTS[0]} compact />
          <ProductTile p={DEMO_PRODUCTS[1]} compact saved />
        </View>
        <View style={pk.phoneGrid}>
          <ProductTile p={DEMO_PRODUCTS[2]} compact />
          <ProductTile p={DEMO_PRODUCTS[3]} compact />
        </View>
      </View>
      <LinearGradient
        colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.9)', '#fff']}
        locations={[0, 0.55, 1]}
        style={pk.phoneFade}
        pointerEvents="none"
      />
    </View>
  );
}

// ---------- Circular progress ----------
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
export function CircularProgress({ value, size = 130, stroke = 7 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = useSharedValue(value);
  useEffect(() => {
    v.set(withTiming(value, { duration: 300 }));
  }, [value, v]);
  const props = useAnimatedProps(() => ({ strokeDashoffset: c * (1 - v.value) }));
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke="#EEEEF1" strokeWidth={stroke} fill="none" />
      <AnimatedCircle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={colors.purple}
        strokeWidth={stroke}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={`${c} ${c}`}
        animatedProps={props}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

// ---------- Confetti ----------
const { width: W, height: H } = Dimensions.get('window');
const CONFETTI_COLORS = [colors.lime, colors.purple, '#7B5CF0', colors.green, '#DDB0E6'];

// Deterministic pseudo-random spec per piece (keeps render pure and stable).
function pieceSpec(i: number) {
  let seed = (i + 1) * 9301;
  const next = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const rand = (a: number, b: number) => a + next() * (b - a);
  return {
    x: rand(-W * 0.5, W * 0.5),
    y: rand(H * 0.25, H * 1.05),
    rot: rand(-540, 540),
    w: rand(6, 14),
    h: rand(10, 26),
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: rand(0, 250),
    round: next() > 0.7,
  };
}

function Piece({ i }: { i: number }) {
  const spec = useMemo(() => pieceSpec(i), [i]);
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(spec.delay, withTiming(1, { duration: 2200, easing: Easing.out(Easing.quad) })));
  }, [spec.delay, t]);
  const style = useAnimatedStyle(() => ({
    opacity: t.value < 0.85 ? 1 : (1 - t.value) / 0.15,
    transform: [
      { translateX: spec.x * t.value },
      { translateY: -60 + spec.y * t.value - 220 * Math.sin(Math.PI * Math.min(t.value * 1.6, 1)) },
      { rotate: `${spec.rot * t.value}deg` },
    ],
  }));
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: W / 2,
          top: H * 0.3,
          width: spec.w,
          height: spec.h,
          backgroundColor: spec.color,
          borderRadius: spec.round ? spec.w : 2,
        },
        style,
      ]}
    />
  );
}

export function Confetti({ count = 60 }: { count?: number }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {Array.from({ length: count }, (_, i) => (
        <Piece key={i} i={i} />
      ))}
    </View>
  );
}

const pk = StyleSheet.create({
  pack: {
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    transform: [{ rotate: '-2deg' }],
  },
  brand: { fontWeight: '900', textAlign: 'center', letterSpacing: 0.5 },
  tile: {
    height: 150,
    borderRadius: 10,
    backgroundColor: '#F3F3F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileStatus: { position: 'absolute', left: 8, bottom: 8 },
  tileSave: { position: 'absolute', right: 8, bottom: 8 },
  tileName: { fontSize: 13, lineHeight: 17, fontWeight: '500', color: colors.ink, marginTop: 6 },
  phone: {
    width: 290,
    height: 470,
    borderRadius: 42,
    backgroundColor: '#111',
    padding: 9,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  phoneInner: { flex: 1, borderRadius: 34, backgroundColor: '#fff', paddingHorizontal: 12, overflow: 'hidden' },
  phoneStatus: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    height: 34,
  },
  phoneTime: { fontSize: 11, fontWeight: '600' },
  phoneSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  phoneSearch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    height: 28,
    paddingHorizontal: 8,
  },
  phoneSearchText: { fontSize: 9, color: '#666' },
  phoneFilters: { flexDirection: 'row', gap: 5, marginTop: 8, overflow: 'hidden' },
  phoneFilter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 6,
    height: 20,
  },
  phoneFilterText: { fontSize: 8, color: colors.ink },
  phoneGrid: { flexDirection: 'row', gap: 10, marginTop: 10 },
  phoneFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 190,
  },
});
