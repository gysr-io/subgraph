// common utilities and helper functions

import { Address, BigDecimal, BigInt, log } from '@graphprotocol/graph-ts';

import { User } from '../../generated/schema'
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL } from '../util/constants'


export function integerToDecimal(value: BigInt, decimals: BigInt = BigInt.fromI32(18)): BigDecimal {
  let denom = BigInt.fromI32(10).pow(decimals.toI32() as u8);
  return value.toBigDecimal().div(denom.toBigDecimal());
}

export function initializeUser(address: Address): User {
  let user = new User(address.toHexString());
  user.operations = ZERO_BIG_INT;
  user.earned = ZERO_BIG_DECIMAL;

  return user;
}
