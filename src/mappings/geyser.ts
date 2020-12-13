// Geyser event handling and mapping

import { Address, BigInt, log } from "@graphprotocol/graph-ts"
import { 
    Geyser as GeyserContract,
    Staked,
    Unstaked,
    RewardsFunded,
    RewardsDistributed,
    RewardsUnlocked,
    RewardsExpired,
    GysrSpent
} from "../../generated/templates/Geyser/Geyser"
import { Geyser, Token } from "../../generated/schema"
import { tokensToDecimal } from "../util/common"


export function handleStaked(event: Staked): void {
    // todo
}


export function handleUnstaked(event: Unstaked): void {
    // todo
}


export function handleRewardsFunded(event: RewardsFunded): void {
    let geyser = Geyser.load(event.address.toHexString());
    let token = Token.load(geyser.rewardToken);

    let amount = tokensToDecimal(event.params.amount, token.decimals)
    geyser.rewards = geyser.rewards.plus(amount);
    geyser.funded = geyser.funded.plus(amount);

    geyser.save();
}


export function handleRewardsDistributed(event: RewardsDistributed): void {
    let geyser = Geyser.load(event.address.toHexString());
    let token = Token.load(geyser.rewardToken);

    let amount = tokensToDecimal(event.params.amount, token.decimals);
    geyser.rewards = geyser.rewards.minus(amount);
    geyser.distributed = geyser.distributed.plus(amount);

    geyser.save();
}


export function handleRewardsUnlocked(event: RewardsUnlocked): void {
    // todo
}


export function handleRewardsExpired(event: RewardsExpired): void {
    // todo
}


export function handleGysrSpent(event: GysrSpent): void {
    // todo
}