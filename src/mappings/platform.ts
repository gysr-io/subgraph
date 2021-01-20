// platform wide mappings

import { Address, BigInt, log, ethereum } from '@graphprotocol/graph-ts'
import { Geyser as GeyserContract } from '../../generated/templates/Geyser/Geyser'
import { Geyser, Token, Platform } from '../../generated/schema'
import { ZERO_BIG_INT, ZERO_ADDRESS } from '../util/constants'
import { getPrice } from '../pricing/token'
import { updatePricing } from '../pricing/geyser'


export function handleBlock(block: ethereum.Block): void {
  // run handler periodically to keep stats fresh
  if (block.number.mod(BigInt.fromI32(1000)).notEqual(ZERO_BIG_INT)) {
    return;
  }
  let platform = Platform.load(ZERO_ADDRESS);
  if (platform === null) {
    return;
  }

  let geysers = platform._geysers;
  var stale: string[] = [];

  for (let i = 0; i < geysers.length; i++) {
    // load
    let geyser = Geyser.load(geysers[i])!;
    let stakingToken = Token.load(geyser.stakingToken)!;
    let rewardToken = Token.load(geyser.rewardToken)!;

    // bind to contract
    let contract = GeyserContract.bind(Address.fromString(geyser.id));

    // update pricing info
    stakingToken.price = getPrice(stakingToken);
    stakingToken.updated = block.timestamp;
    rewardToken.price = getPrice(rewardToken);
    rewardToken.updated = block.timestamp;

    updatePricing(geyser, contract, stakingToken, rewardToken, block.timestamp);
    geyser.updated = block.timestamp;

    // store
    geyser.save();
    stakingToken.save();
    rewardToken.save();

    // remove from priced geyser list if stale
    if (geyser.state == 'Stale') {
      stale.push(geyser.id);
      log.info('Marking geyser as stale', [geyser.id.toString()]);
    }
  }

  if (stale.length) {
    platform._geysers = geysers.filter((x) => !stale.includes(x));
  }
}
