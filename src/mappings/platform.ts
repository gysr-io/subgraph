// platform wide mappings

import { Address, BigInt, log, ethereum } from '@graphprotocol/graph-ts'
import { GeyserV1 as GeyserV1Contract } from '../../generated/templates/GeyserV1/GeyserV1'
import { Pool, Token, Platform } from '../../generated/schema'
import { ZERO_BIG_INT, ZERO_ADDRESS } from '../util/constants'
import { getPrice } from '../pricing/token'
import { updatePricing } from '../pricing/pool'
import { updatePoolDayData } from '../util/common'


export function handleUpdate(event: ethereum.Event): void {
  // run handler periodically to keep stats fresh
  //if (event.block.number.mod(BigInt.fromI32(1000)).notEqual(ZERO_BIG_INT)) {
  //  return;
  //}
  let platform = Platform.load(ZERO_ADDRESS);
  if (platform === null) {
    return;
  }

  let pools = platform._activePools;
  var stale: string[] = [];

  for (let i = 0; i < pools.length; i++) {
    // load
    let pool = Pool.load(pools[i])!;
    let stakingToken = Token.load(pool.stakingToken)!;
    let rewardToken = Token.load(pool.rewardToken)!;

    // bind to contract
    let contract = GeyserV1Contract.bind(Address.fromString(pool.id));

    // update pricing info
    stakingToken.price = getPrice(stakingToken);
    stakingToken.updated = event.block.timestamp;
    rewardToken.price = getPrice(rewardToken);
    rewardToken.updated = event.block.timestamp;

    updatePricing(pool, platform!, contract, stakingToken, rewardToken, event.block.timestamp);
    pool.updated = event.block.timestamp;

    // update pool day snapshot
    let poolDayData = updatePoolDayData(pool, event.block.timestamp.toI32());

    // store
    pool.save();
    stakingToken.save();
    rewardToken.save();
    platform.save();
    poolDayData.save();

    // remove from priced pool list if stale
    if (pool.state == 'Stale') {
      stale.push(pool.id);
      log.info('Marking pool as stale {}', [pool.id.toString()]);
    }
  }

  if (stale.length) {
    platform._activePools = pools.filter((x) => !stale.includes(x));
    platform.save();
  }
}
