'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CheckCircle2, Database, ExternalLink, Link2, LoaderCircle, QrCode, ShieldCheck, TriangleAlert, WalletCards } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

const retiredContractAddresses = new Set(['0xc97f6762f1d1ab2f1fb7c9ab17bc111d3bc2d82b']);
const defaultContractAddress = '0x0a85C6Dd93051d11775f4F8709d372e4f821a698';
const environmentContractAddress = process.env.NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS?.trim() ?? '';
const genLayerContractAddress = environmentContractAddress && !retiredContractAddresses.has(environmentContractAddress.toLowerCase())
  ? environmentContractAddress
  : defaultContractAddress;
const configuredExplorerUrl = process.env.NEXT_PUBLIC_GENLAYER_EXPLORER_URL?.trim() ?? '';
const genLayerExplorerUrl = configuredExplorerUrl.toLowerCase().includes('0xc97f6762f1d1ab2f1fb7c9ab17bc111d3bc2d82b') ? '' : configuredExplorerUrl;
const bradburyExplorerUrl = 'https://explorer-bradbury.genlayer.com/';
const contractStorageKey = 'agentproof-genlayer-contract-address-v2';
const expectedPolicyVersion = 'agent-income-v2';

type InjectedProvider = {
  request: (request: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (accounts: unknown) => void) => void;
  removeListener?: (event: string, listener: (accounts: unknown) => void) => void;
  isMetaMask?: boolean;
  isOkxWallet?: boolean;
  isOKExWallet?: boolean;
  isBinance?: boolean;
  providers?: InjectedProvider[];
};

type WalletOption = {
  id: string;
  name: string;
  rdns: string;
  provider: InjectedProvider;
};

type Eip6963ProviderDetail = {
  info?: { uuid?: string; name?: string; rdns?: string };
  provider?: InjectedProvider;
};

export default function Home() {
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const zh = language === 'zh';
  const [wallet, setWallet] = useState('');
  const [checkedWallet, setCheckedWallet] = useState('');
  const [evidence, setEvidence] = useState<any>(null);
  const [linkage, setLinkage] = useState<any>(null);
  const [integrity, setIntegrity] = useState<any>(null);
  const [assessment, setAssessment] = useState<any>(null);
  const [genLayerPreview, setGenLayerPreview] = useState<any>(null);
  const [reportId, setReportId] = useState('尚未生成');
  const [evidenceJson, setEvidenceJson] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingLinkage, setCheckingLinkage] = useState(false);
  const [error, setError] = useState('');
  const [chainStatus, setChainStatus] = useState<'idle' | 'connecting' | 'submitting' | 'waiting' | 'done' | 'error'>('idle');
  const [chainTxHash, setChainTxHash] = useState('');
  const [chainError, setChainError] = useState('');
  const [chainNotice, setChainNotice] = useState('');
  const [chainJudgment, setChainJudgment] = useState<any>(null);
  const [walletAccount, setWalletAccount] = useState('');
  const [walletOptions, setWalletOptions] = useState<WalletOption[]>([]);
  const [activeWalletId, setActiveWalletId] = useState('');
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [walletConnectError, setWalletConnectError] = useState('');
  const [contractAddress, setContractAddress] = useState(genLayerContractAddress);
  const [deployStatus, setDeployStatus] = useState<'idle' | 'connecting' | 'submitting' | 'waiting' | 'done' | 'error'>('idle');
  const [deployTxHash, setDeployTxHash] = useState('');
  const [deployError, setDeployError] = useState('');
  const runId = useRef(0);
  const hasDeployedContract = /^0x[0-9a-fA-F]{40}$/.test(contractAddress);
  const contractExplorerUrl = genLayerExplorerUrl || (hasDeployedContract ? `${bradburyExplorerUrl}address/${contractAddress}` : bradburyExplorerUrl);

  useEffect(() => {
    if (genLayerContractAddress) return;
    const savedAddress = window.localStorage.getItem(contractStorageKey)?.trim() ?? '';
    if (/^0x[0-9a-fA-F]{40}$/.test(savedAddress) && !retiredContractAddresses.has(savedAddress.toLowerCase())) setContractAddress(savedAddress);
  }, []);

  useEffect(() => {
    if (retiredContractAddresses.has(contractAddress.toLowerCase())) setContractAddress('');
  }, [contractAddress]);

  useEffect(() => {
    if (!contractAddress && genLayerContractAddress) setContractAddress(genLayerContractAddress);
  }, [contractAddress]);

  useEffect(() => {
    const discovered = new Map<InjectedProvider, WalletOption>();
    const publish = () => setWalletOptions(Array.from(discovered.values()));
    const addProvider = (provider: InjectedProvider | undefined, name?: string, rdns?: string, id?: string) => {
      if (!provider || typeof provider.request !== 'function' || discovered.has(provider)) return;
      const normalizedRdns = rdns || inferWalletRdns(provider);
      if (normalizedRdns !== 'org.browser.wallet' && Array.from(discovered.values()).some((option) => option.rdns === normalizedRdns)) return;
      discovered.set(provider, {
        id: id || `${rdns || name || 'wallet'}-${discovered.size}`,
        name: name || inferWalletName(provider),
        rdns: normalizedRdns,
        provider,
      });
      publish();
    };
    const announce = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
      addProvider(detail?.provider, detail?.info?.name, detail?.info?.rdns, detail?.info?.uuid);
    };

    window.addEventListener('eip6963:announceProvider', announce as EventListener);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    const injectedWindow = window as typeof window & {
      ethereum?: InjectedProvider;
      okxwallet?: InjectedProvider;
      BinanceChain?: InjectedProvider;
    };
    const legacyProviders = injectedWindow.ethereum?.providers?.length
      ? injectedWindow.ethereum.providers
      : [injectedWindow.ethereum];
    legacyProviders.forEach((provider) => addProvider(provider));
    addProvider(injectedWindow.okxwallet, 'OKX Wallet', 'com.okex.wallet');
    addProvider(injectedWindow.BinanceChain, 'Binance Wallet', 'com.binance.wallet');

    return () => window.removeEventListener('eip6963:announceProvider', announce as EventListener);
  }, []);

  const activeWallet = walletOptions.find((option) => option.id === activeWalletId);

  useEffect(() => {
    const provider = activeWallet?.provider;
    if (!provider) {
      setWalletAccount('');
      return;
    }
    let active = true;
    const updateAccounts = (value: unknown) => {
      const accounts = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
      if (active) setWalletAccount(accounts[0] ?? '');
    };
    void provider.request({ method: 'eth_accounts' }).then(updateAccounts).catch(() => undefined);
    provider.on?.('accountsChanged', updateAccounts);
    return () => {
      active = false;
      provider.removeListener?.('accountsChanged', updateAccounts);
    };
  }, [activeWallet]);

  async function connectWallet(option: WalletOption) {
    try {
      setWalletConnecting(true);
      setWalletConnectError('');
      const accounts = await option.provider.request({ method: 'eth_requestAccounts' }) as string[];
      setActiveWalletId(option.id);
      setWalletAccount(accounts[0] ?? '');
      setWalletDialogOpen(false);
    } catch (caught) {
      setWalletConnectError(caught instanceof Error ? caught.message : (zh ? '钱包连接没有完成。' : 'Wallet connection did not complete.'));
    } finally {
      setWalletConnecting(false);
    }
  }

  async function runCheck(event: React.FormEvent) {
    event.preventDefault();
    const nextWallet = wallet.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(nextWallet)) {
      setError(zh ? '请输入一个完整的 Base 钱包地址（0x 开头，共 42 个字符）。' : 'Enter a complete Base wallet address (42 characters starting with 0x).');
      return;
    }
    const thisRun = ++runId.current;
    setLoading(true);
    setCheckingLinkage(false);
    setError('');
    setEvidence(null);
    setLinkage(null);
    setIntegrity(null);
    setGenLayerPreview(null);
    setChainStatus('idle');
    setChainTxHash('');
    setChainError('');
    setChainNotice('');
    setChainJudgment(null);
    try {
      const response = await fetch('/api/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet: nextWallet, includeLinkage: false }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Verification failed.');
      if (runId.current !== thisRun) return;
      setCheckedWallet(nextWallet);
      setEvidence(payload.antseed);
      setIntegrity(payload.integrity);
      setAssessment(payload.assessment);
      setGenLayerPreview(payload.genLayerPreview);
      setReportId(payload.reportId);
      setEvidenceJson(payload.evidenceJson);
      setLoading(false);
      if (payload.antseed?.payments?.customers?.length) {
        setCheckingLinkage(true);
        void runWalletCheck(nextWallet, thisRun);
      } else {
        void loadExistingGenLayerJudgment(payload.reportId, thisRun);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Verification failed.');
      setLoading(false);
    }
  }

  async function runWalletCheck(nextWallet: string, thisRun: number) {
    try {
      const response = await fetch('/api/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet: nextWallet, includeLinkage: true }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Wallet check failed.');
      if (runId.current !== thisRun) return;
      // Keep the fast first response on screen, but use the fully enriched
      // evidence bundle and its matching report ID for the onchain judgment.
      // This prevents a user from submitting while payer-link checks are stale.
      setLinkage(payload.linkage);
      setEvidenceJson(payload.evidenceJson);
      setReportId(payload.reportId);
      void loadExistingGenLayerJudgment(payload.reportId, thisRun);
    } catch {
      // Income and official AntSeed integrity results remain usable even when
      // the optional explorer enrichment is temporarily unavailable.
    } finally {
      if (runId.current === thisRun) setCheckingLinkage(false);
    }
  }

  async function loadExistingGenLayerJudgment(nextReportId: string, thisRun: number) {
    if (!hasDeployedContract || !nextReportId || nextReportId === '尚未生成') return;
    try {
      const [{ createClient }, { testnetBradbury }, { TransactionHashVariant }] = await Promise.all([
        import('genlayer-js'),
        import('genlayer-js/chains'),
        import('genlayer-js/types'),
      ]);
      const client = createClient({ chain: testnetBradbury });
      const existingJudgment = await readStoredJudgment(client, contractAddress, nextReportId, TransactionHashVariant);
      if (!existingJudgment || runId.current !== thisRun) return;
      setChainJudgment(existingJudgment);
      setChainStatus('done');
      setChainNotice(zh ? '已从链上读取这份报告现有的 GenLayer 判断；查看结果不需要连接钱包。' : 'The existing GenLayer judgment was loaded from the contract. Reading it does not require a wallet connection.');
    } catch {
      // A missing stored result is normal for a report that has not yet been
      // submitted. The visitor can still review the evidence without a wallet.
    }
  }

  async function submitToGenLayer() {
    if (!hasDeployedContract || !evidenceJson || reportId === '尚未生成') return;
    const provider = activeWallet?.provider;
    if (!provider) {
      setWalletDialogOpen(true);
      setChainStatus('idle');
      setChainError(zh ? '请先选择并连接一个钱包，再提交链上判断。' : 'Choose and connect a wallet before submitting an onchain judgment.');
      return;
    }

    let submittedTxHash = '';
    try {
      setChainError('');
      setChainNotice('');
      setChainStatus('connecting');
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
      const account = accounts[0];
      if (!account || !/^0x[0-9a-fA-F]{40}$/.test(account)) throw new Error('No wallet account was selected.');
      setWalletAccount(account);

      const [{ createClient }, { testnetBradbury }, { TransactionHashVariant }] = await Promise.all([
        import('genlayer-js'),
        import('genlayer-js/chains'),
        import('genlayer-js/types'),
      ]);
      const client = createClient({
        chain: testnetBradbury,
        account: account as `0x${string}`,
        provider: provider as any,
      });
      await client.connect('testnetBradbury');

      let deployedPolicyVersion: unknown;
      try {
        deployedPolicyVersion = await client.readContract({
          address: contractAddress as `0x${string}`,
          functionName: 'get_policy_version',
          args: [],
          transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL,
        });
      } catch {
        throw new Error('LEGACY_CONTRACT');
      }
      if (deployedPolicyVersion !== expectedPolicyVersion) throw new Error('LEGACY_CONTRACT');

      const existingJudgment = await readStoredJudgment(client, contractAddress, reportId, TransactionHashVariant);
      if (existingJudgment) {
        setChainJudgment(existingJudgment);
        setChainStatus('done');
        setChainNotice(zh ? '这份报告已经判断过，已直接读取链上结果；没有再次发送交易。' : 'This report was already judged. Its stored result was loaded without sending another transaction.');
        return;
      }

      setChainStatus('submitting');
      const txHash = await client.writeContract({
        address: contractAddress as `0x${string}`,
        functionName: 'judge',
        args: [reportId, evidenceJson],
        value: 0n,
      }) as `0x${string}`;
      submittedTxHash = txHash;
      setChainTxHash(txHash);
      setChainStatus('waiting');

      await waitForSuccessfulGenLayerResult(client, txHash);
      let storedJudgment: unknown;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          storedJudgment = await client.readContract({
            address: contractAddress as `0x${string}`,
            functionName: 'get_judgment',
            args: [reportId],
            transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL,
          });
          break;
        } catch (readError) {
          if (attempt === 5) throw readError;
          await new Promise((resolve) => setTimeout(resolve, 2_000));
        }
      }
      const parsedJudgment = typeof storedJudgment === 'string' ? JSON.parse(storedJudgment) : storedJudgment;
      setChainJudgment(parsedJudgment);
      setChainStatus('done');
    } catch (caught) {
      if (submittedTxHash) {
        try {
          const [{ createClient }, { testnetBradbury }, { TransactionHashVariant }] = await Promise.all([
            import('genlayer-js'),
            import('genlayer-js/chains'),
            import('genlayer-js/types'),
          ]);
          const recoveryClient = createClient({ chain: testnetBradbury });
          const existingJudgment = await readStoredJudgment(recoveryClient, contractAddress, reportId, TransactionHashVariant);
          if (existingJudgment) {
            setChainJudgment(existingJudgment);
            setChainStatus('done');
            setChainNotice(zh ? '这份报告之前已经写入合约；本次重复交易失败，但已为你读取原来的链上结果。' : 'This report was already stored. The duplicate transaction failed, but the original onchain result has been loaded.');
            return;
          }
        } catch {
          // Fall through to the original transaction error when no stored
          // result can be recovered safely.
        }
      }
      setChainStatus('error');
      setChainError(describeChainError(caught, Boolean(submittedTxHash), zh));
    }
  }

  async function deployToGenLayer() {
    if (hasDeployedContract) return;
    const provider = activeWallet?.provider;
    if (!provider) {
      setWalletDialogOpen(true);
      setDeployStatus('idle');
      setDeployError(zh ? '请先选择并连接一个钱包，再部署合约。' : 'Choose and connect a wallet before deploying the contract.');
      return;
    }

    let txHash: `0x${string}` | undefined;
    try {
      setDeployError('');
      setDeployStatus('connecting');
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
      const account = accounts[0];
      if (!account || !/^0x[0-9a-fA-F]{40}$/.test(account)) throw new Error('No wallet account was selected.');
      setWalletAccount(account);

      const sourceResponse = await fetch('/contracts/income_credibility_judge.py', { cache: 'no-store' });
      if (!sourceResponse.ok) throw new Error('Could not load the verified contract source.');
      const code = await sourceResponse.text();
      if (!code.includes('class IncomeCredibilityJudge') || !code.includes(`POLICY_VERSION = "${expectedPolicyVersion}"`) || !code.startsWith('# { "Depends": "py-genlayer:')) {
        throw new Error('The contract source failed its local identity check.');
      }

      const [{ createClient }, { testnetBradbury }] = await Promise.all([
        import('genlayer-js'),
        import('genlayer-js/chains'),
      ]);
      const client = createClient({
        chain: testnetBradbury,
        account: account as `0x${string}`,
        provider: provider as any,
      });
      await client.connect('testnetBradbury');

      setDeployStatus('submitting');
      txHash = await client.deployContract({ code, args: [] });
      setDeployTxHash(txHash);
      setDeployStatus('waiting');

      const receipt = await waitForSuccessfulDeployment(client, txHash);
      if (receipt.txExecutionResultName && receipt.txExecutionResultName !== 'FINISHED_WITH_RETURN') {
        throw new Error(`Contract deployment execution failed: ${receipt.txExecutionResultName}`);
      }
      const deployedAddress = receipt.txDataDecoded?.type === 'deploy' ? receipt.txDataDecoded.contractAddress : undefined;
      if (!deployedAddress || !/^0x[0-9a-fA-F]{40}$/.test(deployedAddress)) {
        throw new Error('Deployment finalized, but the contract address was not returned. Keep the transaction ID and inspect it before retrying.');
      }

      setContractAddress(deployedAddress);
      window.localStorage.setItem(contractStorageKey, deployedAddress);
      setDeployStatus('done');
    } catch (caught) {
      setDeployStatus('error');
      const message = caught instanceof Error ? caught.message : 'GenLayer contract deployment failed.';
      setDeployError(txHash ? `${message} ${zh ? '交易已经发出，请先核对这笔交易，不要重复部署。' : 'A transaction was already submitted; inspect it before retrying.'}` : message);
    }
  }

  const payments = evidence?.payments;
  const observedCustomer = payments?.customerBreakdown?.[0]?.buyer ?? '—';
  const customerLink = linkage?.customers?.[0];
  const indicators: string[] = customerLink?.indicators ?? [];
  const linkageExplanation = customerLink?.interpretation ?? 'Run the verification to inspect recent direct transfers and common funding sources.';
  const payerCount = payments?.customers?.length;
  const topPayers = payments?.customerBreakdown?.slice(0, 5) ?? [];
  const lifecycle = payments?.lifecycle;
  const chainReasonCodes = cleanChainReasonCodes(chainJudgment?.reason_codes, payments);
  const chainTone = chainVerdictTone(chainJudgment?.verdict);
  const chainPoints = plainJudgmentPoints(chainJudgment, payments, indicators, Boolean(linkage), integrity, zh);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Dialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen}>
        <DialogContent className="border border-white/10 bg-[#111116] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{zh ? '选择钱包' : 'Choose a wallet'}</DialogTitle>
            <DialogDescription>
              {zh ? '这里只会请求读取你主动选择的公开地址。连接本身不会发交易、不会要求签名，也不会读取助记词或私钥。' : 'This only requests the public address from the wallet you choose. Connecting does not send a transaction, request a signature, or access a seed phrase or private key.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {walletOptions.map((option) => (
              <Button key={option.id} type="button" variant="outline" onClick={() => void connectWallet(option)} disabled={walletConnecting} className="h-12 justify-between border-white/10 bg-white/[0.04] px-4 text-white hover:bg-white/10">
                <span className="flex items-center gap-3"><span className="flex size-7 items-center justify-center rounded-full bg-white/10 text-xs font-semibold">{walletInitial(option.name)}</span>{option.name}</span>
                {activeWalletId === option.id && walletAccount ? <span className="font-mono text-xs text-emerald-300">{shortAddress(walletAccount)}</span> : <span className="text-xs text-muted-foreground">{zh ? '浏览器插件' : 'Browser extension'}</span>}
              </Button>
            ))}
            {walletOptions.length === 0 && <p className="rounded-lg border border-amber-300/20 bg-amber-300/7 p-3 text-xs leading-5 text-amber-100/80">{zh ? '目前没有检测到兼容的钱包插件。安装 MetaMask、OKX Wallet 或 Binance Wallet 后刷新页面。' : 'No compatible wallet extension was detected. Install MetaMask, OKX Wallet, or Binance Wallet and then refresh.'}</p>}
            <div className="mt-1 flex h-12 items-center justify-between rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-4 text-muted-foreground" aria-disabled="true">
              <span className="flex items-center gap-3"><QrCode className="size-5" />{zh ? '手机扫码连接' : 'Connect by QR code'}</span>
              <span className="text-xs">{zh ? '需配置 WalletConnect' : 'WalletConnect setup required'}</span>
            </div>
          </div>
          <p className="text-[11px] leading-5 text-muted-foreground">{zh ? '安全提醒：真正的链上提交会由你选择的钱包另外弹窗，并显示网络和交易内容；请逐项确认后再批准。任何页面都不应向你索要助记词或私钥。' : 'Security note: an actual onchain submission opens a separate wallet confirmation showing the network and transaction. Review it before approving. No website should ask for your seed phrase or private key.'}</p>
        </DialogContent>
      </Dialog>
      <header className="border-b border-white/8">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-3">
            <img src="/agent-revenue-passport-logo.svg" alt="" className="size-8 rounded-lg" />
            <div><p className="text-sm font-semibold tracking-tight">Agent Revenue Passport</p><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{hasDeployedContract ? (zh ? '由 GenLayer 合约支持' : 'Powered by a GenLayer contract') : (zh ? 'GenLayer 就绪原型' : 'GenLayer-ready prototype')}</p></div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => setWalletDialogOpen(true)} disabled={walletConnecting} className="border-white/10 bg-white/[0.04] text-white hover:bg-white/10">
              {walletConnecting ? <LoaderCircle className="animate-spin" /> : <WalletCards />}
              <span className="hidden sm:inline">{walletAccount ? `${activeWallet?.name ?? (zh ? '钱包' : 'Wallet')} ${shortAddress(walletAccount)}` : (zh ? '连接钱包' : 'Connect wallet')}</span>
            </Button>
            <div className="flex rounded-lg border border-white/10 bg-white/[0.04] p-1 text-xs">
              <button type="button" onClick={() => setLanguage('zh')} className={`rounded-md px-2.5 py-1.5 transition ${zh ? 'bg-white text-black' : 'text-muted-foreground hover:text-white'}`}>中文</button>
              <button type="button" onClick={() => setLanguage('en')} className={`rounded-md px-2.5 py-1.5 transition ${!zh ? 'bg-white text-black' : 'text-muted-foreground hover:text-white'}`}>English</button>
            </div>
            <Badge variant="outline" className="hidden border-emerald-400/25 bg-emerald-400/8 text-emerald-300 sm:inline-flex">{zh ? 'AntSeed · Base · GH Bounty 下一步接入' : 'AntSeed · Base · GH Bounty next'}</Badge>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-5 py-10 sm:py-14">
        {walletConnectError && <p role="alert" className="mb-5 rounded-xl border border-red-300/20 bg-red-300/8 px-4 py-3 text-sm text-red-200">{walletConnectError}</p>}
        <div className="mb-9 max-w-3xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">{zh ? '购买前智能审查' : 'Pre-purchase intelligence'}</p>
          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl">{zh ? '信任一个 Agent 前，先核验它的收入声明。' : 'Check an agent’s revenue claims before you trust them.'}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{zh ? '核对公开付款证据、钱包关联线索，并准备可解释的 GenLayer 共识裁决——不会把每一笔转账都冒充收入。' : 'Public payment evidence, wallet-link clues, and an explainable GenLayer consensus verdict—without pretending that every transfer is income.'}</p>
        </div>

        <form onSubmit={runCheck} className="search-shell mb-10 flex flex-col gap-3 p-2 sm:flex-row">
          <Input required autoComplete="off" spellCheck={false} aria-label={zh ? 'Agent 钱包地址' : 'Agent wallet address'} value={wallet} onChange={(event) => setWallet(event.target.value)} className="h-12 flex-1 border-0 bg-transparent px-4 font-mono text-sm focus-visible:ring-0" placeholder={zh ? '输入 Base 上的 Agent 钱包地址' : 'Enter an Agent wallet on Base'} />
          <Button type="submit" size="lg" disabled={loading} className="h-12 rounded-xl bg-white px-5 text-black hover:bg-white/85">{loading ? <><LoaderCircle className="animate-spin" /> {zh ? '正在检查…' : 'Checking…'}</> : <>{zh ? '验证 Agent' : 'Verify agent'} <ArrowRight /></>}</Button>
        </form>

        {(loading || checkingLinkage) && <div className="-mt-6 mb-8 flex items-center gap-2 text-sm text-violet-200"><LoaderCircle className="size-4 animate-spin" />{loading ? (zh ? '正在读取并更新收入账本，通常约 10–60 秒…' : 'Loading and updating the income ledger, usually 10–60 seconds…') : (zh ? '收入已经显示，正在检查主要付款钱包，通常约 30–60 秒…' : 'Income is ready. Checking major payer wallets, usually 30–60 seconds…')}</div>}

        {error && <p role="alert" className="mb-6 rounded-xl border border-red-300/20 bg-red-300/8 px-4 py-3 text-sm text-red-200">{error}</p>}

        {evidence && <>
        {checkedWallet && <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs text-muted-foreground">{zh ? '正在分析' : 'Analysis for'}</p><p className="mt-1 max-w-[78vw] truncate font-mono text-sm text-white">{checkedWallet}</p></div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" />{zh ? '证据来自公开数据源' : 'Evidence fetched from public sources'}</div>
        </div>}

        <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
          <section className="panel p-6 sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div><p className="section-label">{zh ? '目前查到的结果' : 'Current finding'}</p><h2 className={`mt-2 text-2xl font-semibold tracking-tight ${integrity?.provenWashTrader || Number(genLayerPreview?.selfPaymentRisk ?? 0) >= 70 ? 'text-red-300' : ''}`}>{!evidence ? (zh ? '输入钱包后开始验证' : 'Enter a wallet to begin') : !evidence.found ? (zh ? '该地址没有买方签名的 AntSeed 付款记录' : 'No buyer-signed AntSeed payment for this address') : checkingLinkage ? (zh ? '已找到收入记录，正在补充钱包关系' : 'Income records found; wallet enrichment is running') : (zh ? '已找到买方签名付款记录' : 'Buyer-signed payment records found')}</h2></div>
              <div className="score-ring"><span className={positiveScoreClass(genLayerPreview?.incomeCredibility)}>{genLayerPreview?.incomeCredibility ?? '—'}</span><small>{zh ? '效果预览' : 'preview'}</small></div>
            </div>
            <p className="max-w-2xl leading-7 text-muted-foreground">{zh ? plainChineseSummary(payments, indicators, checkingLinkage, integrity) : (assessment?.explanation ?? 'Buyer-approved payment evidence was found.')}</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label={zh ? '收入记录可信度' : 'Revenue evidence'} value={genLayerPreview ? formatScore(genLayerPreview.incomeCredibility, zh) : payments?.settlementCount ? (zh ? '已找到收入' : 'Income found') : (zh ? '等待验证' : 'Awaiting check')} valueClassName={positiveScoreClass(genLayerPreview?.incomeCredibility)} /><Metric label={zh ? '欺诈风险' : 'Fraud risk'} value={genLayerPreview ? formatScore(genLayerPreview.selfPaymentRisk, zh) : (zh ? '等待检查' : 'Awaiting check')} valueClassName={riskScoreClass(genLayerPreview?.selfPaymentRisk)} /><Metric label={zh ? '证据充分程度' : 'Evidence sufficiency'} value={genLayerPreview ? formatScore(genLayerPreview.evidenceSufficiency, zh) : '—'} valueClassName={positiveScoreClass(genLayerPreview?.evidenceSufficiency)} /><Metric label={zh ? '买方签名付款率' : 'Buyer-signed payment rate'} value={formatPercent(lifecycle?.buyerAcceptanceRate, '—')} valueClassName="text-violet-200" /></div>
            <div className="mt-7 border-t border-white/8 pt-6">
              <p className="section-label mb-4">{zh ? '判断依据' : 'Why this result'}</p>
              <div className="space-y-3">
                <Reason icon={<CheckCircle2 />} title={payments?.settlementCount ? (zh ? '付款记录包含买方签名' : 'Payment records contain buyer signatures') : (zh ? '没有买方签名付款' : 'No buyer-signed payment')} detail={payments?.settlementCount ? (zh ? `AntSeed 通道合约记录了 ${formatCount(payments.settlementCount, '0')} 次买方签名结算，累计 ${formatUsd(payments.settledUsdc, '$0')}。买方签名只证明付款发生，不代表付款钱包一定与 Agent 无关。` : `The AntSeed channel contract recorded ${formatCount(payments.settlementCount, '0')} buyer-signed settlements totaling ${formatUsd(payments.settledUsdc, '$0')}. A signature proves payment occurred, not that the payer is independent.`) : (zh ? '该地址没有成功结算的买方签名付款。' : 'No successfully settled buyer-signed payment was found.')} />
                <Reason icon={<CheckCircle2 />} title={zh ? '历史收入账本已读取' : 'Historical income ledger loaded'} detail={zh ? '系统读取已有历史账本，并同时检查链上新增记录。用户看到的是本次验证得到的累计结果。' : 'The system loads its historical ledger and checks for new onchain records before showing totals.'} />
                <Reason icon={integrity?.provenWashTrader ? <TriangleAlert /> : checkingLinkage ? <LoaderCircle className="animate-spin" /> : <Link2 />} title={integrity?.provenWashTrader ? (zh ? '异常结算占比' : 'Anomalous settlement share') : indicators.length ? (zh ? '发现钱包关联线索' : 'Wallet-link clues found') : (zh ? '链上异常记录' : 'Onchain anomaly record')} detail={integrity?.provenWashTrader ? (zh ? `链上记录显示，异常结算金额占累计结算金额的 ${formatPercent(integrity.provenWashShare, '0%')}。GenLayer 会结合整份证据判断是否存在欺诈行为。` : `Onchain records show anomalous settlements representing ${formatPercent(integrity.provenWashShare, '0%')} of total settled value. GenLayer uses the full evidence bundle to determine whether fraud occurred.`) : checkingLinkage ? (zh ? '收入判断已经完成；系统正在额外检查主要付款钱包的直接转账与共同资金来源。' : 'Income verification is complete while optional wallet enrichment runs.') : indicators.length ? (zh ? localizeLinkage(customerLink, indicators) : linkageExplanation) : (zh ? '当前已读取的记录中，没有出现明确的异常结算。GenLayer 会结合整份证据判断是否存在欺诈行为。' : 'No clear anomalous settlement appears in the records read so far. GenLayer uses the full evidence bundle to determine whether fraud occurred.')} />
              </div>
            </div>
          </section>

          <div className="grid gap-4">
            <section className="panel p-6">
              <div className="flex items-center gap-3"><Database className="text-violet-300" /><h2 className="font-semibold">{zh ? '证据概览' : 'Evidence snapshot'}</h2></div>
              <dl className="mt-5 space-y-4 text-sm"><Row label={zh ? '累计买方签名金额' : 'Lifetime buyer-signed value'} value={formatUsd(payments?.settledUsdc, '—')} /><Row label={zh ? '买方签名结算次数' : 'Buyer-signed settlements'} value={formatCount(payments?.settlementCount, '—')} /><Row label={zh ? '付款钱包数量' : 'Payer wallets'} value={formatCount(payerCount, '—')} /><Row label={zh ? '已付款完成的通道' : 'Completed with payment'} value={formatCount(lifecycle?.completedAcceptedChannelCount, '—')} /><Row label={zh ? '结束但未付款的通道' : 'Ended without payment'} value={formatCount(lifecycle?.unpaidEndedChannelCount, '—')} /><Row label={zh ? '买方签名付款率' : 'Buyer-signed payment rate'} value={formatPercent(lifecycle?.buyerAcceptanceRate, '—')} /><Row label={zh ? '最大付款方占比' : 'Largest payer share'} value={formatPercent(payments?.largestCustomerShare, '—')} /><Row label={zh ? '数据来源' : 'Data source'} value={zh ? localizeSource(payments?.source) : (payments?.source ?? '—')} /></dl>
              <p className="mt-5 rounded-xl border border-sky-300/15 bg-sky-300/6 p-3 text-xs leading-5 text-sky-100/75">{zh ? '结算金额必须带有买方签名。通道结束但没有付款，只记为“未获买方付款认可”，不会自动把责任算在任何一方。“证据充分程度”只表示本次需要的数据有没有读全，不代表 Agent 是好是坏。' : 'Settled value requires a buyer signature. A channel that ends unpaid is recorded as not buyer-approved, without automatically assigning fault. Evidence sufficiency measures data coverage, not whether an agent is good or bad.'}</p>
            </section>
            <section className="panel p-6">
              <div className="flex items-center gap-3"><ShieldCheck className="text-emerald-300" /><h2 className="font-semibold">{zh ? '钱包证据' : 'Wallet evidence'}</h2></div>
              <p className="mt-4 text-xs text-muted-foreground">{zh ? '观察到的客户地址' : 'Observed customer'}</p><p className="mt-1 truncate font-mono text-xs text-white">{observedCustomer}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="outline" className="border-violet-300/25 text-violet-200">{zh ? '等待 GenLayer 最终判断' : 'Awaiting GenLayer judgment'}</Badge>
                {checkingLinkage ? <Badge variant="outline" className="border-violet-300/25 text-violet-200">{zh ? '正在补充钱包关系' : 'Checking wallet links'}</Badge> : indicators.length ? indicators.map((item) => <Badge key={item} variant="outline" className="border-amber-300/25 text-amber-200">{labelValue(item, zh)}</Badge>) : linkage ? <Badge variant="outline">{zh ? '抽查未发现直接关联' : 'No direct link in sample'}</Badge> : null}
              </div>
              {checkedWallet && <a className="mt-5 inline-flex items-center gap-1.5 text-xs text-violet-300 hover:text-violet-200" href={`https://base.blockscout.com/address/${checkedWallet}`} target="_blank" rel="noreferrer">{zh ? '在 Blockscout 查看' : 'Inspect on Blockscout'} <ExternalLink className="size-3" /></a>}
            </section>
          </div>
        </div>

        {topPayers.length > 0 && <section className="panel mt-4 overflow-hidden p-6 sm:p-7">
          <div><p className="section-label">{zh ? '主要付款钱包' : 'Top payer wallets'}</p><h2 className="mt-2 text-xl font-semibold">{zh ? '累计结算贡献最高的前五个地址' : 'Top five addresses by settled value'}</h2></div>
          <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="border-b border-white/10 text-xs text-muted-foreground"><tr><th className="pb-3 font-medium">{zh ? '钱包地址' : 'Wallet'}</th><th className="pb-3 font-medium">{zh ? '结算次数' : 'Settlements'}</th><th className="pb-3 font-medium">{zh ? '累计金额' : 'Value'}</th><th className="pb-3 text-right font-medium">{zh ? '占比' : 'Share'}</th></tr></thead><tbody>{topPayers.map((payer: any) => <tr key={payer.buyer} className="border-b border-white/6 last:border-0"><td className="py-4 pr-6 font-mono text-xs text-white">{payer.buyer}</td><td className="py-4 pr-6 font-mono">{formatCount(payer.settlementCount, '—')}</td><td className="py-4 pr-6 font-mono">{formatUsd(payer.settledUsdc, '—')}</td><td className="py-4 text-right font-mono">{formatPercent(payer.share, '—')}</td></tr>)}</tbody></table></div>
          <p className="mt-4 text-xs leading-5 text-muted-foreground">{zh ? '欺诈风险会核对链上异常结算记录、直接转账和共同资金来源。没有发现异常，不等于所有付款钱包都已经被证明彼此独立。' : 'Fraud risk checks anomalous settlements, direct transfers, and shared funding sources. No anomaly found does not prove that every payer wallet is independent.'}</p>
        </section>}

        <section className="panel mt-4 p-6 sm:p-7">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div className="max-w-2xl">
              <p className="section-label">{zh ? '交给 GenLayer' : 'GenLayer handoff'}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">{hasDeployedContract ? (zh ? 'GenLayer 智能合约' : 'GenLayer Intelligent Contract') : (zh ? 'GenLayer 判断结果预览' : 'GenLayer judgment preview')}</h2>
              {!hasDeployedContract && genLayerPreview && <p className="mt-3 text-base leading-7 text-white">{previewSummary(genLayerPreview, integrity, zh)}</p>}
              {!hasDeployedContract && <p className="mt-3 text-sm leading-6 text-muted-foreground">{zh ? '这里先展示最终产品的判断效果。部署智能合约后，同一批证据会交给 GenLayer 验证者正式判断。' : 'This previews the final product experience. After deployment, the same evidence is formally judged by GenLayer validators.'}</p>}
              {hasDeployedContract && !chainJudgment && <p className="mt-3 text-sm leading-6 text-muted-foreground">{zh ? '完成上方验证后，可把同一份证据交给 GenLayer 判断。提交时需要用钱包确认并支付 Bradbury 测试币；查看网页和已有结果不需要连接钱包。' : 'After the check above, the same evidence can be submitted to GenLayer. A wallet and Bradbury test tokens are required to submit; browsing the site and reading existing results do not require a wallet.'}</p>}
            </div>
            <Badge variant="outline" className={`w-fit ${hasDeployedContract ? 'border-emerald-300/25 bg-emerald-300/8 text-emerald-200' : 'border-amber-300/25 bg-amber-300/8 text-amber-200'}`}>{hasDeployedContract ? (zh ? 'Bradbury 已部署' : 'Deployed on Bradbury') : (zh ? '合约尚未部署' : 'Contract not deployed')}</Badge>
          </div>
          {!hasDeployedContract && genLayerPreview?.reasons?.length > 0 && <div className="mt-5 grid gap-3 sm:grid-cols-2">{genLayerPreview.reasons.map((reason: any) => <div key={reason.code} className="rounded-xl border border-white/8 bg-black/15 p-4"><p className="text-xs font-medium text-violet-200">{labelPreviewReason(reason.code, zh)}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{previewReasonDetail(reason, zh)}</p></div>)}</div>}
          {!hasDeployedContract && <p className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/7 p-3 text-xs leading-5 text-amber-100/80">{zh ? '用于预览最终产品的效果。' : 'A preview of the final product experience.'}</p>}
          <div className="mt-5 rounded-xl border border-white/8 bg-black/20 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{zh ? '报告编号' : 'Report ID'}</p>
            <p className="mt-2 break-all font-mono text-xs text-white">{reportId}</p>
          </div>
          {hasDeployedContract && <div className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-300/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-200/75">{zh ? '合约地址' : 'Contract address'}</p>
            <p className="mt-2 break-all font-mono text-xs text-white">{contractAddress}</p>
            <a className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-300 hover:text-emerald-200" href={contractExplorerUrl} target="_blank" rel="noreferrer">{zh ? '在 GenLayer 浏览器查看' : 'View in GenLayer Explorer'} <ExternalLink className="size-3" /></a>
          </div>}
          {!hasDeployedContract && <div className="mt-4 rounded-xl border border-violet-300/15 bg-violet-300/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button type="button" onClick={deployToGenLayer} disabled={['connecting', 'submitting', 'waiting'].includes(deployStatus)} className="w-fit bg-violet-200 text-violet-950 hover:bg-violet-100">
                {deployStatus === 'connecting' ? (zh ? '正在连接钱包…' : 'Connecting wallet…') : deployStatus === 'submitting' ? (zh ? '等待钱包确认部署…' : 'Confirm deployment in wallet…') : deployStatus === 'waiting' ? (zh ? '等待合约最终确认…' : 'Waiting for finalization…') : deployStatus === 'done' ? (zh ? '合约部署完成' : 'Contract deployed') : (zh ? '用钱包部署到 Bradbury' : 'Deploy to Bradbury with wallet')}
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">{zh ? '点击后会加载已经检查过的合约代码，并由你选择的钱包亲自确认 Bradbury 测试网交易。只会使用测试币，网站不会读取私钥。' : 'This loads the checked contract source and asks you to confirm the Bradbury testnet transaction in your selected wallet. It uses test tokens only and never reads your private key.'}</p>
            </div>
            {deployTxHash && <p className="mt-3 break-all font-mono text-[10px] text-violet-200">{zh ? '部署交易编号：' : 'Deployment transaction: '}{deployTxHash}</p>}
            {deployError && <p role="alert" className="mt-3 rounded-xl border border-red-300/20 bg-red-300/8 p-3 text-xs leading-5 text-red-200">{deployError}</p>}
          </div>}
          {hasDeployedContract && <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="button" onClick={submitToGenLayer} disabled={!evidenceJson || checkingLinkage || ['connecting', 'submitting', 'waiting'].includes(chainStatus)} className="w-fit bg-violet-200 text-violet-950 hover:bg-violet-100">
              {checkingLinkage ? (zh ? '等待完整钱包检查…' : 'Waiting for complete wallet check…') : chainStatus === 'connecting' ? (zh ? '正在连接钱包…' : 'Connecting wallet…') : chainStatus === 'submitting' ? (zh ? '等待钱包确认…' : 'Confirm in wallet…') : chainStatus === 'waiting' ? (zh ? '等待 GenLayer 共识…' : 'Waiting for GenLayer consensus…') : chainStatus === 'done' ? (zh ? 'GenLayer 判断完成' : 'GenLayer judgment complete') : (zh ? '提交给 GenLayer 判断' : 'Submit for GenLayer judgment')}
            </Button>
            <p className="text-xs leading-5 text-muted-foreground">{zh ? '点击后会切换到 Bradbury，并由你选择的钱包亲自确认交易。连接只读取公开地址；网站不会读取助记词或私钥，也不会发起代币无限授权。' : 'This switches to Bradbury and asks you to confirm in your selected wallet. Connecting only reads the public address; the site never accesses seed phrases or private keys and never requests unlimited token approval.'}</p>
          </div>}
          {chainTxHash && <a className="mt-3 inline-flex break-all font-mono text-[10px] text-violet-200 hover:text-violet-100" href={`${bradburyExplorerUrl}tx/${chainTxHash}`} target="_blank" rel="noreferrer">{zh ? '交易编号：' : 'Transaction: '}{chainTxHash}</a>}
          {chainStatus === 'done' && <p className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-300/7 p-3 text-xs text-emerald-100">{zh ? '判断已写入合约，最终确认正在后台继续。' : 'The judgment is stored in the contract while final settlement continues in the background.'}</p>}
          {chainNotice && <p className="mt-3 rounded-xl border border-sky-300/20 bg-sky-300/7 p-3 text-xs leading-5 text-sky-100">{chainNotice}</p>}
          {chainJudgment && <div className={`mt-4 rounded-xl border p-5 ${chainTone.panel}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className={`section-label ${chainTone.text}`}>{zh ? 'GenLayer 给出的答案' : 'GenLayer answer'}</p><h3 className={`mt-2 text-xl font-semibold ${chainTone.text}`}>{labelChainVerdict(chainJudgment.verdict, payments, chainReasonCodes, zh)}</h3></div>
              <Badge variant="outline" className={chainTone.badge}>{chainJudgment.policy_version ?? 'agent-income-v1'}</Badge>
            </div>
            <p className="mt-4 max-w-4xl text-sm leading-7 text-white/85">{chainJudgmentSummary(chainJudgment, payments, indicators, Boolean(linkage), integrity, zh)}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <Metric label={zh ? '收入可信度' : 'Income credibility'} value={formatScore(chainJudgment.income_credibility, zh)} valueClassName={positiveScoreClass(chainJudgment.income_credibility)} />
              <Metric label={zh ? '欺诈风险' : 'Fraud risk'} value={formatScore(chainJudgment.self_payment_risk, zh)} valueClassName={riskScoreClass(chainJudgment.self_payment_risk)} />
              <Metric label={zh ? '证据充分程度' : 'Evidence sufficiency'} value={formatScore(chainJudgment.evidence_sufficiency, zh)} valueClassName={positiveScoreClass(chainJudgment.evidence_sufficiency)} />
            </div>
            {chainPoints.length > 0 && <div className="mt-5"><p className="text-xs font-medium text-white/80">{zh ? '这个答案是怎么得出的' : 'How this answer was reached'}</p><div className="mt-3 grid gap-2 lg:grid-cols-3">{chainPoints.map((point) => <div key={point.title} className="rounded-lg border border-white/8 bg-black/15 p-4"><p className="text-xs font-medium text-white/90">{point.title}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{point.detail}</p></div>)}</div></div>}
            {Array.isArray(chainJudgment.cited_wallets) && chainJudgment.cited_wallets.length > 0 && <details className="mt-4 rounded-lg border border-white/8 bg-black/10 p-3"><summary className="cursor-pointer text-xs text-muted-foreground">{zh ? '查看本次判断使用的钱包地址' : 'View wallet addresses used in this answer'}</summary><div className="mt-3">{chainJudgment.cited_wallets.map((address: string) => <p key={address} className="mt-1 break-all font-mono text-[10px] text-white/80">{address}</p>)}</div></details>}
          </div>}
          {chainError && <p role="alert" className="mt-3 rounded-xl border border-red-300/20 bg-red-300/8 p-3 text-xs leading-5 text-red-200">{chainError}</p>}
          {evidenceJson && <details className="mt-3 rounded-xl border border-white/8 bg-black/15 p-4">
            <summary className="cursor-pointer text-xs font-medium text-violet-200">{zh ? '查看将提交给合约的完整证据' : 'Inspect exact contract evidence'}</summary>
            <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-5 text-muted-foreground">{publicEvidenceJson(evidenceJson)}</pre>
          </details>}
        </section>
        </>}
      </section>
    </main>
  );
}

function Metric({ label, value, valueClassName = 'text-white' }: { label: string; value: string; valueClassName?: string }) { return <div className="metric"><p>{label}</p><strong className={valueClassName}>{value}</strong></div>; }
function Reason({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) { return <div className="reason"><span>{icon}</span><div><h3>{title}</h3><p>{detail}</p></div></div>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="font-mono text-white">{value}</dd></div>; }

function positiveScoreClass(value: number | null | undefined) {
  if (value == null) return 'text-white';
  if (value >= 70) return 'text-emerald-300';
  if (value >= 40) return 'text-amber-300';
  return 'text-red-300';
}

function riskScoreClass(value: number | null | undefined) {
  if (value == null) return 'text-white';
  if (value >= 70) return 'text-red-300';
  if (value >= 40) return 'text-amber-300';
  return 'text-emerald-300';
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

async function readStoredJudgment(client: any, address: string, id: string, transactionHashVariant: any) {
  try {
    const stored = await client.readContract({
      address: address as `0x${string}`,
      functionName: 'get_judgment',
      args: [id],
      transactionHashVariant: transactionHashVariant.LATEST_NONFINAL,
    });
    return typeof stored === 'string' ? JSON.parse(stored) : stored;
  } catch (caught) {
    const text = genLayerErrorSearchText(caught);
    if (/report(?:_id)? not found/i.test(text)) return null;
    throw caught;
  }
}

function genLayerErrorSearchText(caught: unknown) {
  const error = caught as {
    message?: unknown;
    details?: unknown;
    cause?: { message?: unknown; data?: unknown };
  } | null;
  const parts = [error?.message, error?.details, error?.cause?.message].filter((value): value is string => typeof value === 'string');
  const data = error?.cause?.data;
  if (typeof data === 'string' && /^[0-9a-fA-F]+$/.test(data) && data.length % 2 === 0) {
    try {
      const bytes = new Uint8Array(data.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []);
      parts.push(new TextDecoder().decode(bytes));
    } catch {
      // The normal error fields remain available even when binary return data
      // cannot be decoded by this browser.
    }
  }
  return parts.join(' ');
}

async function waitForSuccessfulDeployment(client: any, hash: `0x${string}`) {
  // A newly broadcast Bradbury transaction can briefly exist before the
  // consensus-data contract exposes getTransactionAllData. Treat that as a
  // normal indexing delay and keep polling instead of reporting a false
  // deployment failure.
  for (let attempt = 0; attempt < 240; attempt += 1) {
    let transaction: any;
    try {
      transaction = await client.getTransaction({ hash });
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 5_000));
      continue;
    }
    const status = transaction?.statusName;
    const execution = transaction?.txExecutionResultName;
    if (['ACCEPTED', 'READY_TO_FINALIZE', 'FINALIZED'].includes(status) && execution === 'FINISHED_WITH_RETURN') return transaction;
    if (status === 'CANCELED' || execution === 'FINISHED_WITH_ERROR') {
      throw new Error(`Contract deployment execution failed: ${execution || status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error('Contract deployment is still processing. Inspect the transaction before retrying.');
}

async function waitForSuccessfulGenLayerResult(client: any, hash: `0x${string}`) {
  // genlayer-js treats timeout/undetermined states as "decided" when waiting
  // for ACCEPTED. Bradbury can automatically appeal those rounds and later
  // accept the same transaction, so keep following the transaction instead of
  // showing a false failure after the first timed-out leader.
  let undeterminedPolls = 0;
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const transaction = await client.getTransaction({ hash });
    const status = transaction?.statusName;
    const execution = transaction?.txExecutionResultName;
    if (['ACCEPTED', 'READY_TO_FINALIZE', 'FINALIZED'].includes(status) && execution === 'FINISHED_WITH_RETURN') return transaction;
    if (status === 'CANCELED' || execution === 'FINISHED_WITH_ERROR') {
      throw new Error(`GenLayer transaction execution failed: ${execution || status}`);
    }
    if (status === 'UNDETERMINED') {
      undeterminedPolls += 1;
      if (undeterminedPolls >= 6) {
        throw new Error('GenLayer validators did not reach agreement: UNDETERMINED');
      }
    } else {
      undeterminedPolls = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error('GenLayer consensus is still processing. Inspect the transaction before retrying.');
}

function inferWalletName(provider: InjectedProvider) {
  if (provider.isOkxWallet || provider.isOKExWallet) return 'OKX Wallet';
  if (provider.isBinance) return 'Binance Wallet';
  if (provider.isMetaMask) return 'MetaMask';
  return 'Browser Wallet';
}

function inferWalletRdns(provider: InjectedProvider) {
  if (provider.isOkxWallet || provider.isOKExWallet) return 'com.okex.wallet';
  if (provider.isBinance) return 'com.binance.wallet';
  if (provider.isMetaMask) return 'io.metamask';
  return 'org.browser.wallet';
}

function walletInitial(name: string) {
  if (/okx/i.test(name)) return 'O';
  if (/binance/i.test(name)) return 'B';
  if (/metamask/i.test(name)) return 'M';
  return name.trim().charAt(0).toUpperCase() || 'W';
}

function describeChainError(caught: unknown, wasSubmitted: boolean, zh: boolean) {
  const code = typeof caught === 'object' && caught !== null && 'code' in caught ? Number((caught as { code?: unknown }).code) : null;
  const message = caught instanceof Error ? caught.message : String(caught || 'Unknown error');
  if (code === 4001 || /user rejected|user denied/i.test(message)) {
    return zh ? '你在钱包里取消了这次操作；交易没有发到链上，也不会扣测试币。' : 'The wallet request was cancelled. Nothing was sent onchain and no test tokens were charged.';
  }
  if (/already judged/i.test(message)) {
    return zh ? '这份报告已经判断过，不需要重复付费提交。' : 'This report has already been judged and does not need another paid submission.';
  }
  if (/LEGACY_CONTRACT/i.test(message)) {
    return zh ? '当前连接的是旧版合约。为避免旧规则继续产生不稳定结果，网页已停止发送交易；请刷新页面并部署新版合约。' : 'The connected contract is outdated. The site stopped before sending a transaction; refresh and deploy the current contract version.';
  }
  if (/NOT_VOTED/i.test(message)) {
    return zh ? '交易已经发到链上，但 GenLayer 验证者没有为这次判断形成有效投票结果。交易可能已经消耗测试币；请先查看交易详情，不要直接重复提交。' : 'The transaction was submitted, but GenLayer validators did not produce a valid vote for this judgment. Test tokens may already have been spent; inspect the transaction before retrying.';
  }
  if (/UNDETERMINED|did not reach agreement/i.test(message)) {
    return zh ? '本次验证流程已经结束，但验证者没有达成一致，因此没有产生正式判断。请先查看交易详情，不要立即重复提交。' : 'This validation round ended without validator agreement, so no formal judgment was produced. Inspect the transaction before retrying.';
  }
  if (!wasSubmitted && /network|rpc|fetch|timeout|switch|chain/i.test(message)) {
    return zh ? '钱包或测试网连接暂时中断；交易没有发到链上，也不会扣测试币。请稍后重试。' : 'The wallet or testnet connection was interrupted. Nothing was sent onchain and no test tokens were charged. Please retry.';
  }
  if (!wasSubmitted) {
    return zh ? `交互在发送到链上前停止；不会扣测试币。${message}` : `The interaction stopped before anything was sent onchain, so no test tokens were charged. ${message}`;
  }
  return zh ? `交易已经发到链上，但执行没有完成。请先用上方交易编号查看详情，不要立即重复提交。${message}` : `The transaction was submitted but did not finish. Inspect the transaction above before retrying. ${message}`;
}

function chainVerdictTone(verdict?: string) {
  if (verdict === 'wash_trading' || verdict === 'high_risk') return { panel: 'border-red-300/25 bg-red-300/6', text: 'text-red-300', badge: 'border-red-300/25 text-red-200' };
  if (verdict === 'mixed' || verdict === 'insufficient_evidence') return { panel: 'border-amber-300/25 bg-amber-300/6', text: 'text-amber-300', badge: 'border-amber-300/25 text-amber-200' };
  return { panel: 'border-emerald-300/20 bg-emerald-300/5', text: 'text-emerald-300', badge: 'border-emerald-300/25 text-emerald-200' };
}

function cleanChainReasonCodes(value: unknown, payments: any) {
  if (!Array.isArray(value)) return [];
  const unique = value.filter((code, index): code is string => typeof code === 'string' && value.indexOf(code) === index);
  if (Number(payments?.settlementCount ?? 0) > 0 || unique.includes('verified_settlement_history')) {
    return unique.filter((code) => code !== 'missing_settlements');
  }
  return unique;
}

function chainJudgmentSummary(judgment: any, payments: any, indicators: string[], walletLinksChecked: boolean, integrity: any, zh: boolean) {
  const credibility = Number(judgment?.income_credibility ?? 0);
  const risk = Number(judgment?.self_payment_risk ?? 0);
  const largestShare = Number(payments?.largestCustomerShare ?? 0);
  const settlementCount = formatCount(payments?.settlementCount, '0');
  const settledValue = formatUsd(payments?.settledUsdc, '$0');
  const payerCount = formatCount(payments?.customers?.length, '0');
  const hasWalletLinks = indicators.length > 0 || judgment?.reason_codes?.includes?.('wallet_linkage_clues');
  const opening = zh
    ? `这个 Agent 共完成 ${settlementCount} 次由买方签名确认的付款，累计收到 ${settledValue}，付款来自 ${payerCount} 个钱包。`
    : `This agent completed ${settlementCount} buyer-signed payments totaling ${settledValue}, from ${payerCount} payer wallets.`;
  if (judgment?.verdict === 'wash_trading' || judgment?.verdict === 'high_risk' || risk >= 70) {
    const abnormalShare = Number(integrity?.provenWashShare ?? 0);
    return zh
      ? `${opening}${abnormalShare > 0 ? `其中约 ${formatPercent(abnormalShare, '—')} 的结算被记录为异常。` : ''}${hasWalletLinks ? '主要付款钱包之间还出现了直接转账或相同资金来源。' : ''}这些迹象说明付款很可能并非来自彼此独立的客户，因此 GenLayer 判断存在欺诈行为。`
      : `${opening}${abnormalShare > 0 ? ` About ${formatPercent(abnormalShare, '—')} of settled value is recorded as anomalous.` : ''}${hasWalletLinks ? ' Major payer wallets also show direct transfers or shared funding.' : ''} These signs indicate that the payments likely did not come from independent customers, so GenLayer found fraudulent activity.`;
  }
  if (judgment?.verdict === 'insufficient_evidence') {
    return zh
      ? payments?.settlementCount ? `${opening}但现有记录无法说明这些付款钱包是否彼此独立，所以 GenLayer 目前无法判断有没有收入欺诈。` : '这个地址目前没有买方签名确认的付款记录，所以 GenLayer 无法判断它的收入是否真实。'
      : payments?.settlementCount ? `${opening} The available records do not show whether these payer wallets are independent, so GenLayer cannot determine whether revenue fraud occurred.` : 'This address has no buyer-signed payment record, so GenLayer cannot determine whether its reported income is genuine.';
  }
  if (judgment?.verdict === 'no_wash_evidence') {
    return zh
      ? `${opening}${walletLinksChecked && !hasWalletLinks ? '主要付款钱包之间没有发现直接转账或相同资金来源。' : ''}收入记录比较可信，目前没有发现明显欺诈行为。`
      : `${opening}${walletLinksChecked && !hasWalletLinks ? ' No direct transfers or shared funding were found among the main payer wallets.' : ''} The revenue record appears credible, with no clear fraudulent activity found.`;
  }
  if (judgment?.verdict === 'mixed') {
    const relationship = hasWalletLinks
      ? (zh ? '主要付款钱包之间发现了直接转账或相同资金来源。' : 'Direct transfers or shared funding were found among the main payer wallets.')
      : walletLinksChecked
        ? (zh ? '主要付款钱包之间没有发现直接转账或相同资金来源，所以欺诈风险没有被判为高风险。' : 'No direct transfers or shared funding were found among the main payer wallets, so fraud risk was not rated high.')
        : '';
    const concentration = largestShare >= 0.5
      ? (zh ? `主要风险是最大的付款方贡献了全部收入的 ${formatPercent(largestShare, '—')}。这说明付款确实发生过，但收入过度依赖单一客户。` : `The main risk is that the largest payer contributed ${formatPercent(largestShare, '—')} of all income. The payments happened, but revenue depends too heavily on one customer.`)
      : '';
    return zh
      ? `${opening}这些付款都有买方签名，因此收入记录有真实付款依据。${relationship}${concentration}`
      : `${opening} These payments are buyer-signed, so the revenue record is backed by actual payments. ${relationship} ${concentration}`;
  }
  if (credibility >= 70 && risk < 40) {
    return zh
      ? `${opening}${walletLinksChecked && !hasWalletLinks ? '主要付款钱包之间没有发现直接转账或相同资金来源。' : ''}这份收入记录比较可信，目前也没有发现明显欺诈行为。`
      : `${opening}${walletLinksChecked && !hasWalletLinks ? ' No direct transfers or shared funding were found among the main payer wallets.' : ''} The revenue record appears credible, with no clear fraudulent activity found.`;
  }
  return zh
    ? `${opening}收入记录比较可信，GenLayer 没有发现明显欺诈行为。`
    : `${opening} The revenue record appears credible, and GenLayer did not find clear fraudulent activity.`;
}

function plainJudgmentPoints(judgment: any, payments: any, indicators: string[], walletLinksChecked: boolean, integrity: any, zh: boolean) {
  if (!judgment) return [];
  if (!Number(payments?.settlementCount ?? 0)) {
    return [{
      title: zh ? '为什么目前无法判断' : 'Why no answer is available yet',
      detail: zh ? '这个地址没有买方签名确认的付款记录。没有真实付款作为依据，就无法判断收入是否可信，也无法判断有没有欺诈行为。' : 'This address has no buyer-signed payment record. Without an actual payment record, neither the income nor possible fraud can be judged.',
    }];
  }
  const hasWalletLinks = indicators.length > 0 || judgment?.reason_codes?.includes?.('wallet_linkage_clues');
  const largestShare = Number(payments?.largestCustomerShare ?? 0);
  const abnormalShare = Number(integrity?.provenWashShare ?? 0);
  const isHigh = judgment?.verdict === 'wash_trading' || judgment?.verdict === 'high_risk' || Number(judgment?.self_payment_risk ?? 0) >= 70;
  const points = [
    {
      title: isHigh ? (zh ? '确认发生过哪些付款' : 'What payments actually occurred') : (zh ? '这份收入为什么有可信度' : 'Why the income has credibility'),
      detail: zh
        ? `${formatCount(payments?.settlementCount, '0')} 次付款都有买方签名，累计金额为 ${formatUsd(payments?.settledUsdc, '$0')}。这证明付款确实发生过，但不代表付款方一定是彼此独立的真实客户。`
        : `${formatCount(payments?.settlementCount, '0')} payments carry buyer signatures, totaling ${formatUsd(payments?.settledUsdc, '$0')}. This proves the payments occurred, but not that the payers were independent customers.`,
    },
    {
      title: zh ? '付款钱包之间有没有明显关联' : 'Whether payer wallets are clearly linked',
      detail: hasWalletLinks
        ? (zh ? '主要付款钱包之间发现了直接转账或相同资金来源，这会提高自己给自己付款的可能性。' : 'Direct transfers or shared funding were found among major payer wallets, increasing the likelihood of self-payment.')
        : walletLinksChecked
          ? isHigh
            ? (zh ? '主要付款钱包之间没有发现直接转账或共同出资，但其他异常付款记录已经足以让整体风险达到高位。' : 'No direct transfers or common funding were found among the main payer wallets, but other anomalous payment records were enough to make the overall risk high.')
            : (zh ? '主要付款钱包之间没有发现直接转账，也没有发现由同一个钱包出资。这是欺诈风险没有被判为高风险的主要原因。' : 'No direct transfers or common funder were found among the main payer wallets. This is the main reason fraud risk was not rated high.')
          : (zh ? '现有记录没有显示主要付款钱包之间存在直接资金关联。' : 'The available records do not show a direct financial link among the main payer wallets.'),
    },
  ];

  if (abnormalShare > 0) {
    points.push({
      title: zh ? '最主要的问题' : 'The main problem',
      detail: zh ? `约 ${formatPercent(abnormalShare, '—')} 的结算被记录为异常，这意味着大部分收入不能视为正常的独立客户付款。` : `About ${formatPercent(abnormalShare, '—')} of settlements are recorded as anomalous, meaning most of the income cannot be treated as normal independent-customer payments.`,
    });
  } else if (largestShare >= 0.5) {
    points.push({
      title: zh ? '最主要的风险点' : 'The main risk',
      detail: zh ? `最大的付款方贡献了总结算金额的 ${formatPercent(largestShare, '—')}。这不能单独证明欺诈，但说明收入非常依赖一个客户。` : `The largest payer contributed ${formatPercent(largestShare, '—')} of settled value. This alone does not prove fraud, but it shows heavy dependence on one customer.`,
    });
  } else {
    points.push({
      title: zh ? '收入是否过度依赖单一客户' : 'Whether revenue depends on one customer',
      detail: zh ? `最大的付款方占总结算金额的 ${formatPercent(largestShare, '—')}。目前没有出现由一个钱包撑起绝大部分收入的情况。` : `The largest payer represents ${formatPercent(largestShare, '—')} of settled value. One wallet is not responsible for most of the income.`,
    });
  }
  return points;
}

function formatCount(value: string | number | undefined, fallback: string) {
  return value == null ? fallback : Number(value).toLocaleString('en-US');
}

function formatUsd(value: number | undefined, fallback: string) {
  return value == null ? fallback : `$${value.toLocaleString('en-US', { maximumFractionDigits: 6 })}`;
}

function formatPercent(value: number | undefined, fallback: string) {
  return value == null ? fallback : `${(value * 100).toFixed(2)}%`;
}

function labelValue(value: string, zh = false) {
  if (zh) return ({ not_scored: '未评分', partial: '部分充分', insufficient: '不足', direct_value_transfer: '发现直接价值转账', shared_native_funder: '共同原生币出资地址', shared_usdc_funder: '共同 USDC 出资地址', requires_genlayer_judgment: '等待 GenLayer 裁决' } as Record<string, string>)[value] ?? value;
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function plainChineseSummary(payments: any, indicators: string[], checkingLinkage: boolean, integrity: any) {
  if (!payments?.settlementCount) return '这个地址没有买方签名认可的 AntSeed 付款记录。';
  const lifecycle = payments.lifecycle;
  const accepted = formatCount(lifecycle?.completedAcceptedChannelCount, '—');
  const unpaid = formatCount(lifecycle?.unpaidEndedChannelCount, '—');
  const base = `该 Agent 累计收到 ${formatUsd(payments.settledUsdc, '$0')}，共有 ${formatCount(payments.settlementCount, '0')} 次买方签名结算，来自 ${formatCount(payments.customers?.length, '0')} 个付款钱包。`;
  const delivery = lifecycle ? `已完成通道中，${accepted} 个有买方付款，${unpaid} 个结束时没有付款。` : '';
  const anomalyStatus = '收入记录比较可信，当前已读取的记录中没有发现明显欺诈行为。';
  if (integrity?.provenWashTrader) return `${base}${delivery}链上记录还显示，异常结算金额占累计结算金额的 ${formatPercent(integrity.provenWashShare, '—')}；GenLayer 会结合整份证据判断是否存在欺诈行为。`;
  if (indicators.length) return `${base}${delivery}另外，主要付款钱包中发现了直接转账或共同资金来源，这会明显提高自己给自己付款的风险。`;
  if (checkingLinkage) return `${base}${delivery}${anomalyStatus}系统正在补充检查主要付款钱包的关系。`;
  return `${base}${delivery}${anomalyStatus}`;
}

function localizeSource(source?: string) {
  if (source === 'agentproof-ledger-plus-recent-rpc') return '本地历史账本 + Base 链上数据';
  if (source === 'base-rpc') return 'Base 链上实时数据';
  if (source === 'base-blockscout') return 'Base 区块浏览器';
  return source ?? '—';
}

function localizeLinkage(customerLink: any, indicators: string[]) {
  if (!customerLink) return '运行验证后，系统会检查直接转账和共同资金来源。';
  if (indicators.length) return `发现 ${indicators.map((item) => labelValue(item, true)).join('、')}。这些只是关联线索，不能单独证明两个钱包属于同一个人。`;
  if (customerLink.lookupErrors?.length) return '这次没有加入额外的区块浏览器记录；核心评分仍然使用买方签名结算、付款集中度和已有链上异常记录。';
  return '在已经检查的记录中，没有发现直接互转或共同出资地址。';
}

function previewSummary(preview: any, integrity: any, zh: boolean) {
  if (preview.verdict === 'no_payment_record') {
    return zh ? '这个地址没有买方签名的 AntSeed 付款记录。' : 'No buyer-signed AntSeed payment record was found for this address.';
  }
  if (integrity?.provenWashTrader || Number(preview.selfPaymentRisk ?? 0) >= 70) {
    return zh ? '该地址存在买方签名付款记录，但欺诈风险较高；GenLayer 会结合整份证据判断是否存在欺诈行为。' : 'Buyer-signed payments exist, but fraud risk is high. GenLayer uses the full evidence bundle to determine whether fraud occurred.';
  }
  if (preview.verdict === 'mixed') {
    return zh ? '已经找到真实付款记录，但付款过度集中或钱包之间存在资金关联，因此风险高于正常水平。' : 'Actual payment records were found, but payer concentration or wallet links make the risk higher than normal.';
  }
  return zh ? '已经找到带有买方签名的链上付款记录；收入记录比较可信，当前证据没有显示明显欺诈行为。' : 'Buyer-signed onchain payment records were found. The revenue record appears credible, and the current evidence shows no clear fraud.';
}

function formatScore(value: number | null | undefined, _zh: boolean) {
  return value == null ? '—' : `${value}/100`;
}

function labelChainVerdict(verdict: string | undefined, payments: any, reasonCodes: string[], zh: boolean) {
  const largestShare = Number(payments?.largestCustomerShare ?? 0);
  const hasWalletLinks = reasonCodes.includes('wallet_linkage_clues');
  const labels: Record<string, [string, string]> = {
    wash_trading: ['判断：存在欺诈行为', 'Finding: fraudulent activity detected'],
    no_wash_evidence: ['收入记录较可信，未发现明显欺诈', 'Revenue appears credible; no clear fraud found'],
    credible: ['收入记录较可信，未发现明显欺诈', 'Revenue appears credible; no clear fraud found'],
    high_risk: ['判断：存在明显欺诈行为', 'Finding: clear fraudulent activity detected'],
    insufficient_evidence: ['目前无法判断这份收入', 'This income cannot currently be judged'],
  };
  if (verdict === 'mixed') {
    if (hasWalletLinks) return zh ? '收入有真实付款依据，但钱包关系存在异常' : 'Revenue has real payment support, but wallet relationships are abnormal';
    if (largestShare >= 0.5) return zh ? '收入有真实付款依据，但客户过于集中' : 'Revenue has real payment support, but customers are too concentrated';
    return zh ? '收入基本可信，但存在明显风险点' : 'Revenue is broadly credible, but has a clear risk factor';
  }
  return labels[verdict ?? '']?.[zh ? 0 : 1] ?? (verdict || (zh ? '判断完成' : 'Judgment complete'));
}

function labelPreviewReason(code: string, zh: boolean) {
  const labels: Record<string, [string, string]> = {
    verified_settlement_history: ['链上结算记录', 'Onchain settlement history'],
    delivery_acceptance: ['买方签名付款情况', 'Buyer-signed payment'],
    payer_concentration: ['最大付款方占比', 'Largest payer concentration'],
    official_wash_proof: ['异常结算占比', 'Anomalous settlement share'],
    official_wash_status: ['链上异常记录', 'Onchain anomaly record'],
    wallet_linkage_clues: ['钱包关联线索', 'Wallet-link clues'],
    bounded_linkage_check: ['钱包关联抽查', 'Bounded wallet-link check'],
    missing_settlements: ['缺少结算证据', 'Missing settlement evidence'],
  };
  return labels[code]?.[zh ? 0 : 1] ?? code;
}

function previewReasonDetail(reason: any, zh: boolean) {
  const facts = reason.facts ?? {};
  if (reason.code === 'verified_settlement_history') {
    return zh
      ? `索引记录了 ${formatCount(facts.settlementCount, '0')} 次买方签名结算，累计 ${formatUsd(facts.settledUsdc, '$0')}，来自 ${formatCount(facts.payerCount, '0')} 个付款钱包。`
      : `${formatCount(facts.settlementCount, '0')} buyer-signed settlements totaling ${formatUsd(facts.settledUsdc, '$0')} were indexed across ${formatCount(facts.payerCount, '0')} payer wallets.`;
  }
  if (reason.code === 'delivery_acceptance') {
    const unpaid = facts.unpaidCount == null ? '' : zh ? `，${formatCount(facts.unpaidCount, '0')} 个结束时没有付款` : `; ${formatCount(facts.unpaidCount, '0')} ended without payment`;
    return zh ? `已结束的通道中，${formatCount(facts.acceptedCount, '0')} 个有买方签名付款${unpaid}。` : `${formatCount(facts.acceptedCount, '0')} completed channels contained buyer-signed payment${unpaid}.`;
  }
  if (reason.code === 'payer_concentration') {
    return zh ? `最大付款钱包（${facts.wallet ?? '—'}）贡献了全部结算金额的 ${formatPercent(facts.share, '—')}。` : `The largest payer wallet (${facts.wallet ?? '—'}) contributed ${formatPercent(facts.share, '—')} of settled value.`;
  }
  if (reason.code === 'official_wash_proof') {
    return zh ? `链上异常结算金额为 ${formatUsd(facts.provenWashVolumeUsdc, '$0')}，占累计结算金额的 ${formatPercent(facts.provenWashShare, '—')}。` : `Onchain anomalous settlements total ${formatUsd(facts.provenWashVolumeUsdc, '$0')}, representing ${formatPercent(facts.provenWashShare, '—')} of settled value.`;
  }
  if (reason.code === 'official_wash_status') return zh ? '当前已读取的链上记录中，没有出现足以直接判定欺诈行为的异常结算。' : 'The onchain records read so far do not contain anomalous settlements sufficient for a fraud finding.';
  if (reason.code === 'wallet_linkage_clues') return zh ? `已检查的主要付款钱包中，有 ${formatCount(facts.linkedWalletCount, '0')} 个出现直接转账或共同资金来源，这会提高欺诈风险。` : `${formatCount(facts.linkedWalletCount, '0')} inspected payer wallets show direct transfers or common funding, increasing fraud risk.`;
  if (reason.code === 'missing_settlements') return zh ? '这个地址没有买方签名的 AntSeed 付款记录。' : 'No buyer-signed AntSeed payment record was found.';
  return zh ? '该原因由固定代码记录，网站可以独立调整说明文字。' : 'This reason is stored as a fixed code; the application controls its display copy.';
}

function publicEvidenceJson(evidenceJson: string) {
  try {
    const evidence = JSON.parse(evidenceJson);
    if (evidence?.computedAssessment) delete evidence.computedAssessment.internalEvidenceLevel;
    return JSON.stringify(evidence, null, 2);
  } catch {
    return '';
  }
}
