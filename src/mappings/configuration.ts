// configuration contract handling

import { log } from '@graphprotocol/graph-ts';
import {
  ParameterUpdated as ParameterUpdatedAddress,
  ParameterUpdated1 as ParameterUpdatedUint256,
  ParameterUpdated2 as ParameterUpdatedAddressUint96
} from '../../generated/Configuration/Configuration';
import { ConfigurationParameter } from '../../generated/schema';
import { integerToDecimal } from '../util/common';

export function handleParameterUpdatedUint256(event: ParameterUpdatedUint256): void {
  // get or create entity
  const paramId = event.params.key.toHexString();
  let param = ConfigurationParameter.load(paramId);
  if (param == null) {
    param = new ConfigurationParameter(paramId);
  }

  // set values
  param.type = 'Uint256';
  param.key = paramId;
  param.number = integerToDecimal(event.params.value);
  param.address = null;
  param.name = KNOWN_KEYS.has(paramId) ? KNOWN_KEYS[paramId] : null;

  // write out
  param.save();
  log.info('set configuration parameter, type: uint256, {}: {}', [
    (param.name || paramId)!,
    param.number!.toString()
  ]);
}

export function handleParameterUpdatedAddress(event: ParameterUpdatedAddress): void {
  // get or create entity
  const paramId = event.params.key.toHexString();
  let param = ConfigurationParameter.load(paramId);
  if (param == null) {
    param = new ConfigurationParameter(paramId);
  }

  // set values
  param.type = 'Address';
  param.key = paramId;
  param.number = null;
  param.address = event.params.value.toHexString();
  param.name = KNOWN_KEYS.has(paramId) ? KNOWN_KEYS[paramId] : null;

  // write out
  param.save();
  log.info('set configuration parameter, type: address, {}: {}', [
    (param.name || paramId)!,
    param.address!
  ]);
}

export function handleParameterUpdatedAddressUint96(event: ParameterUpdatedAddressUint96): void {
  // get or create entity
  const paramId = event.params.key.toHexString();
  let param = ConfigurationParameter.load(paramId);
  if (param == null) {
    param = new ConfigurationParameter(paramId);
  }

  // set values
  param.type = 'AddressUint96';
  param.key = paramId;
  param.number = integerToDecimal(event.params.value1);
  param.address = event.params.value0.toHexString();
  param.name = KNOWN_KEYS.has(paramId) ? KNOWN_KEYS[paramId] : null;

  // write out
  param.save();
  log.info('set configuration parameter, type: address/uint96, {}: {}, {}', [
    (param.name || paramId)!,
    param.address!,
    param.number!.toString()
  ]);
}

// aliases
const KNOWN_KEYS = new Map<string, string>();
KNOWN_KEYS.set(
  '0x25f616b7f06464df406f2c22888182f2cadcd3737206047201a423a011a27532',
  'gysr.core.pool.spend.fee'
);
KNOWN_KEYS.set(
  '0x857df8276eded18697ff2b948da4c56efcb67270a1e761c2b4431f9afbe74977',
  'gysr.core.bond.stake.fee'
);
KNOWN_KEYS.set(
  '0x1040a1d5deeea658ae2f795ac5a237d339aef084f4f2c2c3bbe6954a70687b00',
  'gysr.core.competitive.fund.fee'
);
KNOWN_KEYS.set(
  '0xf866a9547d6d6627751fd85c2c353f6f5741b1a8bc05d106035ae4a3180d5fac',
  'gysr.core.fixed.fund.fee'
);
KNOWN_KEYS.set(
  '0xba883d87c1f27669a52651afd0942565af69d08c14b5aa3e978d9d8bec44aed0',
  'gysr.core.linear.fund.fee'
);
KNOWN_KEYS.set(
  '0x91a73904357cc50cd06dd32e14b63f80b3b420abb4199a72b000d9159b7e82c1',
  'gysr.core.friendly.fund.fee'
);
KNOWN_KEYS.set(
  '0xd1e29290ca39d6f6609718e8595ef7570529107d291d66c9252c6b4e3a36f61a',
  'gysr.core.multi.fund.fee'
);
KNOWN_KEYS.set(
  '0x592240eab623a61231073da7383c3602fe6ce53a8a24519be19cf8c7346624bd',
  'gysr.core.bond.metadata'
);
