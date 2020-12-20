// Geyser event handling and mapping

import { Address, BigInt, log, store } from "@graphprotocol/graph-ts"
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
import { Geyser, Token, User, Position, Stake } from "../../generated/schema"
import { tokensToDecimal, ZERO_BIG_INT, ZERO_BIG_DECIMAL } from "../util/common"


export function handleStaked(event: Staked): void {
    // load geyser and token
    let geyser = Geyser.load(event.address.toHexString());
    let token = Token.load(geyser.stakingToken);

    // load or create user
    let user = User.load(event.params.user.toHexString());

    if (user === null) {
        user = new User(event.params.user.toHexString());
        user.operations = ZERO_BIG_INT;
        user.earned = ZERO_BIG_DECIMAL;
    }

    // load or create position
    let positionId = geyser.id + "_" + user.id;

    let position = Position.load(positionId);

    if (position === null) {
        position = new Position(positionId);
        position.user = user.id;
        position.geyser = geyser.id;
        position.shares = ZERO_BIG_DECIMAL;

        geyser.users = geyser.users.plus(BigInt.fromI32(1));
    }

    // create new stake
    let stakeId = positionId + "_" + event.block.timestamp.toString();

    let stake = new Stake(stakeId);
    stake.position = position.id;
    stake.user = user.id;
    stake.geyser = geyser.id;

    // get share info from contract
    let contract = GeyserContract.bind(event.address);
    let idx = contract.stakeCount(event.params.user).minus(BigInt.fromI32(1));
    let stakeStruct = contract.userStakes(event.params.user, idx);
    let shares = tokensToDecimal(stakeStruct.value0, token.decimals);

    // update info
    stake.shares = shares;
    stake.timestamp = event.block.timestamp;

    position.shares = position.shares.plus(shares);

    user.operations = user.operations.plus(BigInt.fromI32(1));
    geyser.operations = geyser.operations.plus(BigInt.fromI32(1));

    // store
    stake.save();
    position.save();
    user.save();
    geyser.save();
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