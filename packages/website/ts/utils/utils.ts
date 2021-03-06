import { ExchangeContractErrs, ZeroExError } from '0x.js';
import { BigNumber } from '@0xproject/utils';
import deepEqual = require('deep-equal');
import isMobile = require('is-mobile');
import * as _ from 'lodash';
import * as moment from 'moment';
import {
    EtherscanLinkSuffixes,
    Networks,
    Order,
    ScreenWidths,
    Side,
    SideToAssetToken,
    SignatureData,
    Token,
    TokenByAddress,
} from 'ts/types';
import { configs } from 'ts/utils/configs';
import { constants } from 'ts/utils/constants';
import * as u2f from 'ts/vendor/u2f_api';

const LG_MIN_EM = 64;
const MD_MIN_EM = 52;

export const utils = {
    assert(condition: boolean, message: string) {
        if (!condition) {
            throw new Error(message);
        }
    },
    spawnSwitchErr(name: string, value: any) {
        return new Error(`Unexpected switch value: ${value} encountered for ${name}`);
    },
    isNumeric(n: string) {
        return !isNaN(parseFloat(n)) && isFinite(Number(n));
    },
    // This default unix timestamp is used for orders where the user does not specify an expiry date.
    // It is a fixed constant so that both the redux store's INITIAL_STATE and components can check for
    // whether a user has set an expiry date or not. It is set unrealistically high so as not to collide
    // with actual values a user would select.
    initialOrderExpiryUnixTimestampSec(): BigNumber {
        const m = moment('2050-01-01');
        return new BigNumber(m.unix());
    },
    convertToUnixTimestampSeconds(date: moment.Moment, time?: moment.Moment): BigNumber {
        const finalMoment = date;
        if (!_.isUndefined(time)) {
            finalMoment.hours(time.hours());
            finalMoment.minutes(time.minutes());
        }
        return new BigNumber(finalMoment.unix());
    },
    convertToMomentFromUnixTimestamp(unixTimestampSec: BigNumber): moment.Moment {
        return moment.unix(unixTimestampSec.toNumber());
    },
    convertToReadableDateTimeFromUnixTimestamp(unixTimestampSec: BigNumber): string {
        const m = this.convertToMomentFromUnixTimestamp(unixTimestampSec);
        const formattedDate: string = m.format('h:MMa MMMM D YYYY');
        return formattedDate;
    },
    generateOrder(
        networkId: number,
        exchangeContract: string,
        sideToAssetToken: SideToAssetToken,
        orderExpiryTimestamp: BigNumber,
        orderTakerAddress: string,
        orderMakerAddress: string,
        makerFee: BigNumber,
        takerFee: BigNumber,
        feeRecipient: string,
        signatureData: SignatureData,
        tokenByAddress: TokenByAddress,
        orderSalt: BigNumber,
    ): Order {
        const makerToken = tokenByAddress[sideToAssetToken[Side.Deposit].address];
        const takerToken = tokenByAddress[sideToAssetToken[Side.Receive].address];
        const order = {
            maker: {
                address: orderMakerAddress,
                token: {
                    name: makerToken.name,
                    symbol: makerToken.symbol,
                    decimals: makerToken.decimals,
                    address: makerToken.address,
                },
                amount: sideToAssetToken[Side.Deposit].amount.toString(),
                feeAmount: makerFee.toString(),
            },
            taker: {
                address: orderTakerAddress,
                token: {
                    name: takerToken.name,
                    symbol: takerToken.symbol,
                    decimals: takerToken.decimals,
                    address: takerToken.address,
                },
                amount: sideToAssetToken[Side.Receive].amount.toString(),
                feeAmount: takerFee.toString(),
            },
            expiration: orderExpiryTimestamp.toString(),
            feeRecipient,
            salt: orderSalt.toString(),
            signature: signatureData,
            exchangeContract,
            networkId,
        };
        return order;
    },
    consoleLog(message: string) {
        /* tslint:disable */
        console.log(message);
        /* tslint:enable */
    },
    async sleepAsync(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    deepEqual(actual: any, expected: any, opts?: { strict: boolean }) {
        return deepEqual(actual, expected, opts);
    },
    getColSize(items: number) {
        const bassCssGridSize = 12; // Source: http://basscss.com/#basscss-grid
        const colSize = bassCssGridSize / items;
        if (!_.isInteger(colSize)) {
            throw new Error(`Number of cols must be divisible by ${bassCssGridSize}`);
        }
        return colSize;
    },
    getScreenWidth() {
        const documentEl = document.documentElement;
        const body = document.getElementsByTagName('body')[0];
        const widthInPx = window.innerWidth || documentEl.clientWidth || body.clientWidth;
        const bodyStyles: any = window.getComputedStyle(document.querySelector('body'));
        const widthInEm = widthInPx / parseFloat(bodyStyles['font-size']);

        // This logic mirrors the CSS media queries in BassCSS for the `lg-`, `md-` and `sm-` CSS
        // class prefixes. Do not edit these.
        if (widthInEm > LG_MIN_EM) {
            return ScreenWidths.Lg;
        } else if (widthInEm > MD_MIN_EM) {
            return ScreenWidths.Md;
        } else {
            return ScreenWidths.Sm;
        }
    },
    isUserOnMobile(): boolean {
        const isUserOnMobile = isMobile();
        return isUserOnMobile;
    },
    getEtherScanLinkIfExists(addressOrTxHash: string, networkId: number, suffix: EtherscanLinkSuffixes): string {
        const networkName = constants.NETWORK_NAME_BY_ID[networkId];
        if (_.isUndefined(networkName)) {
            return undefined;
        }
        const etherScanPrefix = networkName === Networks.Mainnet ? '' : `${networkName.toLowerCase()}.`;
        return `https://${etherScanPrefix}etherscan.io/${suffix}/${addressOrTxHash}`;
    },
    setUrlHash(anchorId: string) {
        window.location.hash = anchorId;
    },
    async isU2FSupportedAsync(): Promise<boolean> {
        const w = window as any;
        return new Promise((resolve: (isSupported: boolean) => void) => {
            if (w.u2f && !w.u2f.getApiVersion) {
                // u2f object was found (Firefox with extension)
                resolve(true);
            } else {
                // u2f object was not found. Using Google polyfill
                // HACK: u2f.getApiVersion will simply not return a version if the
                // U2F call fails for any reason. Because of this, we set a hard 3sec
                // timeout to the request on our end.
                const getApiVersionTimeoutMs = 3000;
                const intervalId = setTimeout(() => {
                    resolve(false);
                }, getApiVersionTimeoutMs);
                u2f.getApiVersion((version: number) => {
                    clearTimeout(intervalId);
                    resolve(true);
                });
            }
        });
    },
    // This checks the error message returned from an injected Web3 instance on the page
    // after a user was prompted to sign a message or send a transaction and decided to
    // reject the request.
    didUserDenyWeb3Request(errMsg: string) {
        const metamaskDenialErrMsg = 'User denied';
        const paritySignerDenialErrMsg = 'Request has been rejected';
        const ledgerDenialErrMsg = 'Invalid status 6985';
        const isUserDeniedErrMsg =
            _.includes(errMsg, metamaskDenialErrMsg) ||
            _.includes(errMsg, paritySignerDenialErrMsg) ||
            _.includes(errMsg, ledgerDenialErrMsg);
        return isUserDeniedErrMsg;
    },
    getCurrentEnvironment() {
        switch (location.host) {
            case configs.DOMAIN_DEVELOPMENT:
                return 'development';
            case configs.DOMAIN_STAGING:
                return 'staging';
            case configs.DOMAIN_PRODUCTION:
                return 'production';
            default:
                return 'production';
        }
    },
    getIdFromName(name: string) {
        const id = name.replace(/ /g, '-');
        return id;
    },
    getAddressBeginAndEnd(address: string): string {
        const truncatedAddress = `${address.substring(0, 6)}...${address.substr(-4)}`; // 0x3d5a...b287
        return truncatedAddress;
    },
    hasUniqueNameAndSymbol(tokens: Token[], token: Token) {
        if (token.isRegistered) {
            return true; // Since it's registered, it is the canonical token
        }
        const registeredTokens = _.filter(tokens, t => t.isRegistered);
        const tokenWithSameNameIfExists = _.find(registeredTokens, {
            name: token.name,
        });
        const isUniqueName = _.isUndefined(tokenWithSameNameIfExists);
        const tokenWithSameSymbolIfExists = _.find(registeredTokens, {
            name: token.symbol,
        });
        const isUniqueSymbol = _.isUndefined(tokenWithSameSymbolIfExists);
        return isUniqueName && isUniqueSymbol;
    },
    zeroExErrToHumanReadableErrMsg(error: ZeroExError | ExchangeContractErrs, takerAddress: string): string {
        const ZeroExErrorToHumanReadableError: { [error: string]: string } = {
            [ZeroExError.ExchangeContractDoesNotExist]: 'Exchange contract does not exist',
            [ZeroExError.EtherTokenContractDoesNotExist]: 'EtherToken contract does not exist',
            [ZeroExError.TokenTransferProxyContractDoesNotExist]: 'TokenTransferProxy contract does not exist',
            [ZeroExError.TokenRegistryContractDoesNotExist]: 'TokenRegistry contract does not exist',
            [ZeroExError.TokenContractDoesNotExist]: 'Token contract does not exist',
            [ZeroExError.ZRXContractDoesNotExist]: 'ZRX contract does not exist',
            [ZeroExError.UnhandledError]: 'Unhandled error occured',
            [ZeroExError.UserHasNoAssociatedAddress]: 'User has no addresses available',
            [ZeroExError.InvalidSignature]: 'Order signature is not valid',
            [ZeroExError.ContractNotDeployedOnNetwork]: 'Contract is not deployed on the detected network',
            [ZeroExError.InvalidJump]: 'Invalid jump occured while executing the transaction',
            [ZeroExError.OutOfGas]: 'Transaction ran out of gas',
            [ZeroExError.NoNetworkId]: 'No network id detected',
        };
        const exchangeContractErrorToHumanReadableError: {
            [error: string]: string;
        } = {
            [ExchangeContractErrs.OrderFillExpired]: 'This order has expired',
            [ExchangeContractErrs.OrderCancelExpired]: 'This order has expired',
            [ExchangeContractErrs.OrderCancelAmountZero]: "Order cancel amount can't be 0",
            [ExchangeContractErrs.OrderAlreadyCancelledOrFilled]:
                'This order has already been completely filled or cancelled',
            [ExchangeContractErrs.OrderFillAmountZero]: "Order fill amount can't be 0",
            [ExchangeContractErrs.OrderRemainingFillAmountZero]:
                'This order has already been completely filled or cancelled',
            [ExchangeContractErrs.OrderFillRoundingError]: 'Rounding error will occur when filling this order',
            [ExchangeContractErrs.InsufficientTakerBalance]:
                'Taker no longer has a sufficient balance to complete this order',
            [ExchangeContractErrs.InsufficientTakerAllowance]:
                'Taker no longer has a sufficient allowance to complete this order',
            [ExchangeContractErrs.InsufficientMakerBalance]:
                'Maker no longer has a sufficient balance to complete this order',
            [ExchangeContractErrs.InsufficientMakerAllowance]:
                'Maker no longer has a sufficient allowance to complete this order',
            [ExchangeContractErrs.InsufficientTakerFeeBalance]: 'Taker no longer has a sufficient balance to pay fees',
            [ExchangeContractErrs.InsufficientTakerFeeAllowance]:
                'Taker no longer has a sufficient allowance to pay fees',
            [ExchangeContractErrs.InsufficientMakerFeeBalance]: 'Maker no longer has a sufficient balance to pay fees',
            [ExchangeContractErrs.InsufficientMakerFeeAllowance]:
                'Maker no longer has a sufficient allowance to pay fees',
            [ExchangeContractErrs.TransactionSenderIsNotFillOrderTaker]: `This order can only be filled by ${takerAddress}`,
            [ExchangeContractErrs.InsufficientRemainingFillAmount]: 'Insufficient remaining fill amount',
        };
        const humanReadableErrorMsg =
            exchangeContractErrorToHumanReadableError[error] || ZeroExErrorToHumanReadableError[error];
        return humanReadableErrorMsg;
    },
    isParityNode(nodeVersion: string): boolean {
        return _.includes(nodeVersion, 'Parity');
    },
    isTestRpc(nodeVersion: string): boolean {
        return _.includes(nodeVersion, 'TestRPC');
    },
};
