// handler methods for the erc20 friendly reward module

import { Address, BigInt, Bytes, store, log } from '@graphprotocol/graph-ts'
import {
  ERC20BaseRewardModule as ERC20BaseRewardModuleContract,
  RewardsFunded
} from '../../generated/templates/RewardModule/ERC20BaseRewardModule'
import { Staked, Unstaked, Claimed } from '../../generated/templates/StakingModule/ERC20StakingModule'
import { ERC20FriendlyRewardModuleV2 } from '../../generated/templates/StakingModule/ERC20FriendlyRewardModuleV2'
import { ERC20FriendlyRewardModuleV3 } from '../../generated/templates/StakingModule/ERC20FriendlyRewardModuleV3'
import { Pool, User, Token, Funding, Position, Stake } from '../../generated/schema'
import { integerToDecimal } from '../util/common'
import { ZERO_BIG_INT, ZERO_BIG_DECIMAL, INITIAL_SHARES_PER_TOKEN } from '../util/constants'


export function handleUnstakedFriendlyV2(event: Unstaked, pool: Pool, user: User, position: Position, token: Token): void {
  // friendly
  let rewardContract = ERC20FriendlyRewardModuleV2.bind(Address.fromString(pool.rewardModule));
  let count = rewardContract.stakeCount(event.params.user).toI32();

  // get position data from contract
  let shares = ZERO_BIG_DECIMAL;
  let ts = ZERO_BIG_INT;
  if (count > 0) {
    // get info for updated last position
    let s = rewardContract.stakes(event.params.user, BigInt.fromI32(count - 1));
    shares = integerToDecimal(s.value0, token.decimals);
    ts = s.value4;
  }

  // update or delete current stakes
  // (for some reason this didn't work with a derived 'stakes' field)
  let stakes = position.stakes;

  for (let i = stakes.length - 1; i >= 0; i--) {
    if (i >= count) {
      // delete any trailing stakes that we know have been removed
      store.remove('Stake', stakes[i]);
      stakes.pop();
      continue;
    }
    // update remaining trailing stake
    let stake = Stake.load(stakes[i])!;

    // verify position timestamps
    if (ts != stake.timestamp) {
      log.error(
        'Stake timestamps not equal: {} != {}',
        [stake.timestamp.toString(), ts.toString()]
      )
    }

    // set updated share amount
    stake.shares = shares;
    stake.save();
    break;
  }
  position.stakes = stakes;
}


export function handleUnstakedFriendlyV3(event: Unstaked, pool: Pool, user: User, position: Position, token: Token): void {
  // friendly
  let rewardContract = ERC20FriendlyRewardModuleV3.bind(Address.fromString(pool.rewardModule));
  let account = Bytes.fromHexString(event.params.user.toHexString().padStart(64));
  let count = rewardContract.stakeCount(account).toI32();

  // get position data from contract
  let shares = ZERO_BIG_DECIMAL;
  let ts = ZERO_BIG_INT;
  if (count > 0) {
    // get info for updated last position
    let s = rewardContract.stakes(account, BigInt.fromI32(count - 1));
    shares = integerToDecimal(s.value0, token.decimals);
    ts = s.value4;
  }

  // update or delete current stakes
  // (for some reason this didn't work with a derived 'stakes' field)
  let stakes = position.stakes;

  for (let i = stakes.length - 1; i >= 0; i--) {
    if (i >= count) {
      // delete any trailing stakes that we know have been removed
      store.remove('Stake', stakes[i]);
      stakes.pop();
      continue;
    }
    // update remaining trailing stake
    let stake = Stake.load(stakes[i])!;

    // verify position timestamps
    if (ts != stake.timestamp) {
      log.error(
        'Stake timestamps not equal: {} != {}',
        [stake.timestamp.toString(), ts.toString()]
      )
    }

    // set updated share amount
    stake.shares = shares;
    stake.save();
    break;
  }
  position.stakes = stakes;
}


export function handleClaimedFriendlyV2(event: Claimed, pool: Pool, user: User, position: Position, token: Token): void {
  // friendly
  let rewardContract = ERC20FriendlyRewardModuleV2.bind(Address.fromString(pool.rewardModule));
  let count = rewardContract.stakeCount(event.params.user).toI32();

  // update current stakes
  // (for some reason this didn't work with a derived 'stakes' field)
  let stakes = position.stakes;

  if (count == stakes.length && count > 0) {
    // get info for updated last position
    let s = rewardContract.stakes(event.params.user, BigInt.fromI32(count - 1));
    let stake = Stake.load(stakes[count - 1])!;
    stake.timestamp = s.value4;
    stake.save();
  } else {
    // rebuild stakes list
    for (let i = 0; i < stakes.length; i++) {
      store.remove('Stake', stakes[i]);
    }
    stakes = [];
    for (let i = 0; i < count; i++) {
      let s = rewardContract.stakes(event.params.user, BigInt.fromI32(i));
      let stakeId = position.id + '_' + i.toString();

      let stake = new Stake(stakeId);
      stake.position = position.id;
      stake.user = user.id;
      stake.pool = pool.id;
      stake.shares = integerToDecimal(s.value0, token.decimals);
      stake.timestamp = s.value4;

      stake.save();

      stakes = stakes.concat([stake.id]);
    }
  }

  position.stakes = stakes;
}


export function handleClaimedFriendlyV3(event: Claimed, pool: Pool, user: User, position: Position, token: Token): void {
  // friendly
  let rewardContract = ERC20FriendlyRewardModuleV3.bind(Address.fromString(pool.rewardModule));
  let account = Bytes.fromHexString(event.params.user.toHexString().padStart(64));
  let count = rewardContract.stakeCount(account).toI32();

  // update current stakes
  // (for some reason this didn't work with a derived 'stakes' field)
  let stakes = position.stakes;

  if (count == stakes.length && count > 0) {
    // get info for updated last position
    let s = rewardContract.stakes(account, BigInt.fromI32(count - 1));
    let stake = Stake.load(stakes[count - 1])!;
    stake.timestamp = s.value4;
    stake.save();
  } else {
    // rebuild stakes list
    for (let i = 0; i < stakes.length; i++) {
      store.remove('Stake', stakes[i]);
    }
    stakes = [];
    for (let i = 0; i < count; i++) {
      let s = rewardContract.stakes(account, BigInt.fromI32(i));
      let stakeId = position.id + '_' + i.toString();

      let stake = new Stake(stakeId);
      stake.position = position.id;
      stake.user = user.id;
      stake.pool = pool.id;
      stake.shares = integerToDecimal(s.value0, token.decimals);
      stake.timestamp = s.value4;

      stake.save();

      stakes = stakes.concat([stake.id]);
    }
  }

  position.stakes = stakes;
}
