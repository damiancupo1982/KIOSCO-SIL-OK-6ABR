import { CarnetPrices, Socio } from './types';

export const TENNIS_DISCOUNT = 0.30;

export interface LotCalcDetail {
  socio_name: string;
  category: string;
  base_price: number;
  discount: number;
  final_price: number;
  tiene_tenis: boolean;
}

export interface LotCalcResult {
  total_bruto: number;
  total_descuento: number;
  total_final: number;
  details: LotCalcDetail[];
}

const EMPTY: LotCalcResult = { total_bruto: 0, total_descuento: 0, total_final: 0, details: [] };

const detailFor = (s: Socio, category: string, base: number): LotCalcDetail => {
  const discount = s.tiene_tenis && s.tipo_socio === 'INTERNO' ? base * TENNIS_DISCOUNT : 0;
  return {
    socio_name: `${s.last_name}, ${s.first_name}`,
    category,
    base_price: base,
    discount,
    final_price: base - discount,
    tiene_tenis: s.tiene_tenis,
  };
};

const summarize = (details: LotCalcDetail[]): LotCalcResult => ({
  total_bruto: details.reduce((s, d) => s + d.base_price, 0),
  total_descuento: details.reduce((s, d) => s + d.discount, 0),
  total_final: details.reduce((s, d) => s + d.final_price, 0),
  details,
});

export const calcLotCostDetailed = (lotSocios: Socio[], prices: CarnetPrices | null): LotCalcResult => {
  if (!prices) return EMPTY;
  const active = lotSocios.filter(s => s.carnet_status === 'activo');
  const titular = active.find(s => s.category === 'titular');
  if (!titular) return EMPTY;

  const familyGroup = active.filter(s =>
    s.category === 'titular' || s.category === 'familiar_1' || s.category === 'familiar_2' || s.category === 'familiar_3'
  );
  const hasFamilyMembers = familyGroup.length > 1;
  const details: LotCalcDetail[] = [];

  if (!hasFamilyMembers) {
    details.push(detailFor(titular, 'titular', prices.individual_price));
  } else {
    const share = prices.family_price / familyGroup.length;
    for (const member of familyGroup) details.push(detailFor(member, member.category, share));
  }

  for (const adh of active.filter(s => s.category === 'familiar_adherente')) {
    details.push(detailFor(adh, 'familiar_adherente', prices.adherent_extra_price));
  }

  return summarize(details);
};

export const calcExternoCost = (socio: Socio, prices: CarnetPrices | null): LotCalcResult => {
  if (!prices || socio.carnet_status !== 'activo') return EMPTY;
  return summarize([detailFor(socio, socio.category, prices.individual_price)]);
};
