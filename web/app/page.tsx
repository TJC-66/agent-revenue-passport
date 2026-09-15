'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BadgeCheck, CheckCircle2, Copy, Database, ExternalLink, Fingerprint, Link2, LoaderCircle, QrCode, ShieldCheck, TriangleAlert, WalletCards } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { createTransactionKit } from '@genlayer/transaction-kit';
import { GENLAYER_CHAIN, GENLAYER_EXPLORER_URL, ensureStudioNextNetwork } from '@/lib/genlayer/network';

const retiredContractAddresses = new Set([
  '0xc97f6762f1d1ab2f1fb7c9ab17bc111d3bc2d82b',
  '0xa54ee4a975c09c559be562a346153e3e723ad943',
]);
const defaultContractAddress = '0x79ab7ac7a17920354547A0B0b1d8f955F76278CC';
const environmentContractAddress = process.env.NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS?.trim() ?? '';
const configuredContractAddress = environmentContractAddress && !retiredContractAddresses.has(environmentContractAddress.toLowerCase())
  ? environmentContractAddress
  : '';
const genLayerContractAddress = configuredContractAddress || defaultContractAddress;
const genLayerExplorerUrl = GENLAYER_EXPLORER_URL.endsWith('/') ? GENLAYER_EXPLORER_URL : `${GENLAYER_EXPLORER_URL}/`;
const contractStorageKey = 'proofrabbit-genlayer-contract-address-v7-studio-next';
const currentPolicyVersion = 'proofrabbit-revenue-v7';
const currentAttestationVersion = 'proofrabbit-revenue-attestation-v3';
const pendingTransactionStoragePrefix = 'proofrabbit-pending-judgment-v7-studio-next';

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

type VerificationJob = {
  wallet: string;
  reportId: string;
  evidenceJson: string;
  runId: number;
};

type VerificationResponsePayload = {
  error?: string;
  antseed?: { payments?: { customers?: unknown[] } };
  linkage?: unknown;
  integrity?: unknown;
  assessment?: unknown;
  genLayerPreview?: unknown;
  reportId: string;
  evidenceJson: string;
};

type WorkflowStatus = 'idle' | 'scanning' | 'wallet' | 'submitting' | 'consensus' | 'done' | 'error';

function deployedAddressFromTransaction(value: unknown) {
  if (!value || typeof value !== 'object') return '';
  const transaction = value as {
    to_address?: unknown;
    recipient?: unknown;
    txDataDecoded?: { contractAddress?: unknown };
    tx_data_decoded?: { contractAddress?: unknown };
  };
  const candidates = [
    transaction.txDataDecoded?.contractAddress,
    transaction.tx_data_decoded?.contractAddress,
    transaction.to_address,
    transaction.recipient,
  ];
  return candidates.find((candidate): candidate is string => typeof candidate === 'string' && /^0x[0-9a-fA-F]{40}$/.test(candidate)) ?? '';
}

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
  const [contractPolicyVersion, setContractPolicyVersion] = useState('');
  const [attestationVersion, setAttestationVersion] = useState('');
  const [credential, setCredential] = useState<any>(null);
  const [claimStatus, setClaimStatus] = useState<'idle' | 'connecting' | 'submitting' | 'waiting' | 'done' | 'error'>('idle');
  const [claimTxHash, setClaimTxHash] = useState('');
  const [claimError, setClaimError] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
  const [deployStatus, setDeployStatus] = useState<'idle' | 'connecting' | 'submitting' | 'waiting' | 'done' | 'error'>('idle');
  const [deployTxHash, setDeployTxHash] = useState('');
  const [deployError, setDeployError] = useState('');
  const [canDeployUpgrade, setCanDeployUpgrade] = useState(false);
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>('idle');
  const runId = useRef(0);
  const pendingVerification = useRef<VerificationJob | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const hasDeployedContract = /^0x[0-9a-fA-F]{40}$/.test(contractAddress);
  const hasCredentialRegistry = attestationVersion === currentAttestationVersion;
  const contractExplorerUrl = hasDeployedContract ? `${genLayerExplorerUrl}address/${contractAddress}` : genLayerExplorerUrl;

  useEffect(() => {
    setCanDeployUpgrade(['localhost', '127.0.0.1'].includes(window.location.hostname));
    if (configuredContractAddress) return;
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
    if (!hasDeployedContract) {
      setContractPolicyVersion('');
      setAttestationVersion('');
      return;
    }
    let active = true;
    void (async () => {
      try {
        const [{ createClient }, { TransactionHashVariant }] = await Promise.all([
          import('genlayer-js'),
          import('genlayer-js/types'),
        ]);
        const client = createClient({ chain: GENLAYER_CHAIN });
        const policy = await client.readContract({
          address: contractAddress as `0x${string}`,
          functionName: 'get_policy_version',
          args: [],
          transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL,
        });
        if (!active) return;
        setContractPolicyVersion(typeof policy === 'string' ? policy : '');
        try {
          const version = await client.readContract({
            address: contractAddress as `0x${string}`,
            functionName: 'get_attestation_version',
            args: [],
            transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL,
          });
          if (!active) return;
          setAttestationVersion(typeof version === 'string' ? version : '');
          if (checkedWallet) {
            const stored = await readStoredCredential(client, contractAddress, checkedWallet, TransactionHashVariant);
            if (active) setCredential(stored);
          }
        } catch {
          if (active) setAttestationVersion('');
        }
      } catch {
        if (active) {
          setContractPolicyVersion('');
          setAttestationVersion('');
        }
      }
    })();
    return () => { active = false; };
  }, [contractAddress, checkedWallet, hasDeployedContract]);

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
      const alreadyAuthorized = await option.provider.request({ method: 'eth_accounts' }) as string[];
      const accounts = alreadyAuthorized.length > 0
        ? alreadyAuthorized
        : await option.provider.request({ method: 'eth_requestAccounts' }) as string[];
      const account = accounts[0] ?? '';
      setActiveWalletId(option.id);
      setWalletAccount(account);
      setWalletDialogOpen(false);
      const pending = pendingVerification.current;
      if (pending && account) void submitPreparedReport(option, pending, account);
    } catch (caught) {
      setWalletConnectError(caught instanceof Error ? caught.message : (zh ? '钱包连接没有完成。' : 'Wallet connection did not complete.'));
      if (pendingVerification.current) setWorkflowStatus('wallet');
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
    if (!hasDeployedContract || contractPolicyVersion !== currentPolicyVersion) {
      setError(zh ? '请先部署上方的新版 GenLayer 合约，再开始验证地址。' : 'Deploy the new GenLayer contract above before verifying an address.');
      return;
    }
    const thisRun = ++runId.current;
    pendingVerification.current = null;
    setWorkflowStatus('scanning');
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
    setCredential(null);
    setClaimStatus('idle');
    setClaimTxHash('');
    setClaimError('');
    setCopyNotice('');
    try {
      const response = await fetch('/api/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet: nextWallet, includeLinkage: false }) });
      let payload = await response.json() as VerificationResponsePayload;
      if (!response.ok) throw new Error(payload.error || 'Verification failed.');
      if (runId.current !== thisRun) return;
      if (payload.antseed?.payments?.customers?.length) {
        setCheckingLinkage(true);
        try {
          const enrichedResponse = await fetch('/api/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ wallet: nextWallet, includeLinkage: true }) });
          const enrichedPayload = await enrichedResponse.json() as VerificationResponsePayload;
          if (enrichedResponse.ok) payload = enrichedPayload;
        } finally {
          if (runId.current === thisRun) setCheckingLinkage(false);
        }
      }
      if (runId.current !== thisRun) return;
      setCheckedWallet(nextWallet);
      setEvidence(payload.antseed);
      setLinkage(payload.linkage ?? null);
      setIntegrity(payload.integrity);
      setAssessment(payload.assessment);
      setGenLayerPreview(payload.genLayerPreview);
      setReportId(payload.reportId);
      setEvidenceJson(payload.evidenceJson);
      setLoading(false);

      const job: VerificationJob = {
        wallet: nextWallet,
        reportId: payload.reportId,
        evidenceJson: payload.evidenceJson,
        runId: thisRun,
      };
      pendingVerification.current = job;

      try {
        const stored = await loadStoredWorkflow(job);
        if (stored?.judgment) {
          if (runId.current !== thisRun) return;
          setChainJudgment(stored.judgment);
          setCredential(stored.credential);
          setChainStatus('done');
          setChainNotice(zh ? '这份报告已经有 GenLayer 链上判断，因此直接读取现有结果，不会重复发送交易。' : 'This report already has a GenLayer onchain judgment, so the existing result was loaded without sending a duplicate transaction.');
          pendingVerification.current = null;
          setWorkflowStatus('done');
          return;
        }
      } catch (caught) {
        setChainStatus('error');
        setChainError(describeChainError(caught, false, zh));
        setWorkflowStatus('error');
        return;
      }

      if (activeWallet) {
        await submitPreparedReport(activeWallet, job);
      } else {
        setWorkflowStatus('wallet');
        setWalletDialogOpen(true);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Verification failed.');
      setLoading(false);
      setCheckingLinkage(false);
      setWorkflowStatus('error');
    }
  }

  async function loadStoredWorkflow(job: VerificationJob) {
    if (!hasDeployedContract || !job.reportId || job.reportId === '尚未生成') return null;
    const [{ createClient }, { TransactionHashVariant }] = await Promise.all([
      import('genlayer-js'),
      import('genlayer-js/types'),
    ]);
    const client = createClient({ chain: GENLAYER_CHAIN });
    const judgment = await readStoredJudgment(client, contractAddress, job.reportId, TransactionHashVariant);
    if (!judgment) return null;
    const storedCredential = hasCredentialRegistry
      ? await readStoredCredential(client, contractAddress, job.wallet, TransactionHashVariant)
      : null;
    return { judgment, credential: storedCredential };
  }

  async function submitPreparedReport(option: WalletOption, job: VerificationJob, knownAccount = '') {
    if (!hasDeployedContract || !job.evidenceJson || job.reportId === '尚未生成' || runId.current !== job.runId) return;
    const provider = option.provider;

    let submittedTxHash = '';
    try {
      setChainError('');
      setChainNotice('');
      setWorkflowStatus('submitting');
      setChainStatus('connecting');
      const accounts = knownAccount ? [knownAccount] : await provider.request({ method: 'eth_requestAccounts' }) as string[];
      const account = accounts[0] ?? '';
      if (!account || !/^0x[0-9a-fA-F]{40}$/.test(account)) throw new Error('No wallet account was selected.');
      setActiveWalletId(option.id);
      setWalletAccount(account);
      await ensureStudioNextNetwork(provider);

      const [{ createClient }, { TransactionHashVariant }] = await Promise.all([
        import('genlayer-js'),
        import('genlayer-js/types'),
      ]);
      const client = createClient({ chain: GENLAYER_CHAIN });
      const kit = createTransactionKit({
        chain: GENLAYER_CHAIN,
        provider,
        account: account as `0x${string}`,
      });

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
      if (deployedPolicyVersion !== currentPolicyVersion) throw new Error('CREDENTIAL_UPGRADE_REQUIRED');

      const existingJudgment = await readStoredJudgment(client, contractAddress, job.reportId, TransactionHashVariant);
      if (existingJudgment) {
        if (runId.current !== job.runId) return;
        setChainJudgment(existingJudgment);
        if (hasCredentialRegistry) setCredential(await readStoredCredential(client, contractAddress, job.wallet, TransactionHashVariant));
        setChainStatus('done');
        setChainNotice(zh ? '这份报告已经判断过，已直接读取链上结果；没有再次发送交易。' : 'This report was already judged. Its stored result was loaded without sending another transaction.');
        pendingVerification.current = null;
        setWorkflowStatus('done');
        return;
      }

      const pendingKey = pendingTransactionStorageKey(contractAddress, job.reportId);
      const rememberedHash = window.localStorage.getItem(pendingKey)?.trim() ?? '';
      let txHash: `0x${string}`;
      if (/^0x[0-9a-fA-F]{64}$/.test(rememberedHash)) {
        txHash = rememberedHash as `0x${string}`;
        setChainNotice(zh ? '这份报告已有一笔交易正在处理，网页会继续跟踪原交易，不会重复扣测试币。' : 'This report already has a pending transaction. The site will resume that transaction instead of charging test tokens again.');
      } else {
        setChainStatus('submitting');
        const transaction = {
          kind: 'write' as const,
          address: contractAddress as `0x${string}`,
          method: 'judge',
          args: [job.reportId, job.evidenceJson],
        };
        const quote = await kit.estimate({ preset: 'standard' }, transaction);
        const submitted = await kit.submit(quote, transaction);
        txHash = submitted.genlayerTxId;
        window.localStorage.setItem(pendingKey, txHash);
      }
      submittedTxHash = txHash;
      setChainTxHash(txHash);
      setChainStatus('waiting');
      setWorkflowStatus('consensus');

      const tracked = await kit.track(txHash, () => undefined, { until: 'decided' });
      if (tracked.successful === false) {
        throw new Error(`GenLayer transaction execution failed: ${tracked.executionResultName || tracked.statusName || 'unknown'}`);
      }
      let storedJudgment: any = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        storedJudgment = await readStoredJudgment(client, contractAddress, job.reportId, TransactionHashVariant);
        if (storedJudgment) break;
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
      if (!storedJudgment) {
        window.localStorage.removeItem(pendingKey);
        throw new Error('NO_CONSENSUS_RESULT');
      }
      const parsedJudgment = typeof storedJudgment === 'string' ? JSON.parse(storedJudgment) : storedJudgment;
      if (runId.current !== job.runId) return;
      setChainJudgment(parsedJudgment);
      if (hasCredentialRegistry) setCredential(await readStoredCredential(client, contractAddress, job.wallet, TransactionHashVariant));
      setChainStatus('done');
      setChainNotice(zh ? 'GenLayer 判断已经写入合约。下面一次性显示最终结论、证据和凭证资格。' : 'The GenLayer judgment is stored onchain. The final verdict, evidence, and credential eligibility are now shown together.');
      window.localStorage.removeItem(pendingKey);
      pendingVerification.current = null;
      setWorkflowStatus('done');
    } catch (caught) {
      if (submittedTxHash) {
        try {
          const [{ createClient }, { TransactionHashVariant }] = await Promise.all([
            import('genlayer-js'),
            import('genlayer-js/types'),
          ]);
          const recoveryClient = createClient({ chain: GENLAYER_CHAIN });
          const existingJudgment = await readStoredJudgment(recoveryClient, contractAddress, job.reportId, TransactionHashVariant);
          if (existingJudgment) {
            setChainJudgment(existingJudgment);
            if (hasCredentialRegistry) setCredential(await readStoredCredential(recoveryClient, contractAddress, job.wallet, TransactionHashVariant));
            setChainStatus('done');
            setChainNotice(zh ? '这份报告之前已经写入合约；本次重复交易失败，但已为你读取原来的链上结果。' : 'This report was already stored. The duplicate transaction failed, but the original onchain result has been loaded.');
            window.localStorage.removeItem(pendingTransactionStorageKey(contractAddress, job.reportId));
            pendingVerification.current = null;
            setWorkflowStatus('done');
            return;
          }
        } catch {
          // Fall through to the original transaction error when no stored
          // result can be recovered safely.
        }
      }
      if (submittedTxHash && /transaction execution failed|finished_with_error|not_voted|undetermined/i.test(genLayerErrorSearchText(caught))) {
        // A finalized failed transaction is not pending anymore. Keeping its
        // hash would make every retry follow the same failed transaction and
        // prevent the corrected contract from receiving a fresh judgment.
        window.localStorage.removeItem(pendingTransactionStorageKey(contractAddress, job.reportId));
      }
      setChainStatus('error');
      setChainError(describeChainError(caught, Boolean(submittedTxHash), zh));
      setWorkflowStatus('error');
    }
  }

  async function deployToGenLayer() {
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
      setDeployTxHash('');
      setDeployStatus('connecting');
      const alreadyAuthorized = await provider.request({ method: 'eth_accounts' }) as string[];
      const accounts = alreadyAuthorized.length > 0
        ? alreadyAuthorized
        : await provider.request({ method: 'eth_requestAccounts' }) as string[];
      const account = accounts[0];
      if (!account || !/^0x[0-9a-fA-F]{40}$/.test(account)) throw new Error('No wallet account was selected.');
      setWalletAccount(account);
      await ensureStudioNextNetwork(provider);

      const sourceResponse = await fetch('/contracts/income_credibility_judge.py', { cache: 'no-store' });
      if (!sourceResponse.ok) throw new Error('Could not load the verified contract source.');
      const code = await sourceResponse.text();
      if (!code.includes('class IncomeCredibilityJudge') || !code.includes(`POLICY_VERSION = "${currentPolicyVersion}"`) || !code.includes(`ATTESTATION_VERSION = "${currentAttestationVersion}"`) || !code.startsWith('# { "Depends": "py-genlayer:')) {
        throw new Error('The contract source failed its local identity check.');
      }

      const kit = createTransactionKit({
        chain: GENLAYER_CHAIN,
        provider,
        account: account as `0x${string}`,
      });
      setDeployStatus('submitting');
      const transaction = { kind: 'deploy' as const, code, args: [] };
      const quote = await kit.estimate({ preset: 'standard' }, transaction);
      const submitted = await kit.submit(quote, transaction);
      txHash = submitted.genlayerTxId;
      setDeployTxHash(txHash);
      setDeployStatus('waiting');

      const tracked = await kit.track(txHash, () => undefined, { until: 'decided' });
      if (tracked.successful !== true) {
        throw new Error(`Contract deployment execution failed: ${tracked.executionResultName || tracked.statusName || 'unknown'}`);
      }
      const rawDeployment = tracked.contractAddress
        ? null
        : await provider.request({ method: 'eth_getTransactionByHash', params: [txHash] }).catch(() => null);
      const deployedAddress = tracked.contractAddress || deployedAddressFromTransaction(rawDeployment);
      if (!deployedAddress || !/^0x[0-9a-fA-F]{40}$/.test(deployedAddress)) {
        throw new Error('Deployment finalized, but the contract address was not returned. Keep the transaction ID and inspect it before retrying.');
      }

      setContractAddress(deployedAddress);
      window.localStorage.setItem(contractStorageKey, deployedAddress);
      setContractPolicyVersion(currentPolicyVersion);
      setAttestationVersion(currentAttestationVersion);
      setCredential(null);
      setChainJudgment(null);
      setChainStatus('idle');
      setChainNotice(zh ? 'Studio Next 合约已经部署。现在可以提交地址，让 GenLayer 生成并核对针对该地址的完整分析。' : 'The Studio Next contract is deployed. You can now submit an address for GenLayer to generate and validate its complete analysis.');
      setDeployStatus('done');
    } catch (caught) {
      setDeployStatus('error');
      const message = caught instanceof Error ? caught.message : 'GenLayer contract deployment failed.';
      setDeployError(txHash
        ? `${message} ${zh ? 'Studio Next 交易已经生成，请先核对这笔交易，不要重复部署。' : 'A Studio Next transaction was created; inspect it before retrying.'}`
        : describeChainError(caught, false, zh));
    }
  }

  async function claimRevenueCredential() {
    if (!hasCredentialRegistry || !chainJudgment || !checkedWallet) return;
    const provider = activeWallet?.provider;
    if (!provider) {
      setWalletDialogOpen(true);
      setClaimError(zh ? '请先连接被验证地址对应的钱包。' : 'Connect the wallet that owns the assessed address.');
      return;
    }

    let submittedTxHash = '';
    try {
      setClaimError('');
      setCopyNotice('');
      setClaimStatus('connecting');
      const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
      const account = accounts[0];
      if (!account || account.toLowerCase() !== checkedWallet.toLowerCase()) {
        throw new Error('CLAIMANT_MISMATCH');
      }
      setWalletAccount(account);
      await ensureStudioNextNetwork(provider);

      const [{ createClient }, { TransactionHashVariant }] = await Promise.all([
        import('genlayer-js'),
        import('genlayer-js/types'),
      ]);
      const client = createClient({ chain: GENLAYER_CHAIN });
      const kit = createTransactionKit({
        chain: GENLAYER_CHAIN,
        provider,
        account: account as `0x${string}`,
      });

      const existing = await readStoredCredential(client, contractAddress, checkedWallet, TransactionHashVariant);
      if (existing?.report_id === reportId && existing?.status !== 'revoked') {
        setCredential(existing);
        setClaimStatus('done');
        return;
      }

      setClaimStatus('submitting');
      const transaction = {
        kind: 'write' as const,
        address: contractAddress as `0x${string}`,
        method: 'claim_credential',
        args: [reportId],
      };
      const quote = await kit.estimate({ preset: 'standard' }, transaction);
      const submitted = await kit.submit(quote, transaction);
      const txHash = submitted.genlayerTxId;
      submittedTxHash = txHash;
      setClaimTxHash(txHash);
      setClaimStatus('waiting');
      const tracked = await kit.track(txHash, () => undefined, { until: 'decided' });
      if (tracked.successful === false) {
        throw new Error(`GenLayer transaction execution failed: ${tracked.executionResultName || tracked.statusName || 'unknown'}`);
      }

      let stored = null;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        stored = await readStoredCredential(client, contractAddress, checkedWallet, TransactionHashVariant);
        if (stored) break;
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
      if (!stored) throw new Error('Credential was issued but is not readable yet.');
      setCredential(stored);
      setClaimStatus('done');
    } catch (caught) {
      setClaimStatus('error');
      const message = caught instanceof Error ? caught.message : String(caught || 'Unknown error');
      if (/CLAIMANT_MISMATCH/.test(message)) {
        setClaimError(zh ? '只有被验证地址本人可以领取这份凭证。请切换到与该地址完全一致的钱包。' : 'Only the assessed wallet can claim this credential. Switch to that exact wallet address.');
      } else {
        setClaimError(describeChainError(caught, Boolean(submittedTxHash), zh));
      }
    }
  }

  async function copyCredentialLink() {
    if (!checkedWallet || !hasCredentialRegistry) return;
    const url = `${window.location.origin}/proof/${checkedWallet}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyNotice(zh ? '链上核验链接已复制。' : 'Onchain verification link copied.');
    } catch {
      setCopyNotice(url);
    }
  }

  function continuePendingVerification() {
    const pending = pendingVerification.current;
    if (!pending) return;
    setChainError('');
    if (activeWallet) {
      void submitPreparedReport(activeWallet, pending);
      return;
    }
    setWorkflowStatus('wallet');
    setWalletDialogOpen(true);
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
  const chainPoints = plainJudgmentPoints(chainJudgment, payments, indicators, Boolean(linkage), integrity, zh);
  const credentialEligible = isCredentialEligible(chainJudgment);
  const resultsReady = workflowStatus === 'done' && Boolean(evidence && chainJudgment);
  const verificationBusy = ['scanning', 'wallet', 'submitting', 'consensus'].includes(workflowStatus);
  const canContinuePendingVerification = workflowStatus === 'error' && Boolean(evidenceJson && reportId !== '尚未生成');

  useEffect(() => {
    if (!resultsReady) return;
    const frame = window.requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    return () => window.cancelAnimationFrame(frame);
  }, [resultsReady]);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <Dialog open={walletDialogOpen} onOpenChange={setWalletDialogOpen}>
        <DialogContent className="border border-white/10 bg-[#111116] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{zh ? '选择钱包' : 'Choose a wallet'}</DialogTitle>
            <DialogDescription>
              {workflowStatus === 'wallet'
                ? (zh ? '证据已经准备好。选择钱包后，钱包会显示 Studio Next 的 GenLayer 判断交易；请核对后亲自确认。网站不会读取助记词或私钥，也不会请求代币授权。' : 'The evidence is ready. After you choose a wallet, it will show the Studio Next transaction for the GenLayer judgment. Review and approve it yourself. The site never reads seed phrases or private keys and never requests token approval.')
                : (zh ? '这里只会请求读取你主动选择的公开地址。连接本身不会发交易、不会要求签名，也不会读取助记词或私钥。' : 'This only requests the public address from the wallet you choose. Connecting does not send a transaction, request a signature, or access a seed phrase or private key.')}
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
            <img src="/proofrabbit-logo.png" alt="ProofRabbit" className="size-9 rounded-xl object-cover" />
            <div><p className="text-sm font-semibold tracking-tight">ProofRabbit <span className="font-normal text-muted-foreground">证明兔</span></p><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{hasDeployedContract ? (zh ? '由 GenLayer 链上判断支持' : 'Onchain judgment by GenLayer') : (zh ? 'GenLayer 就绪原型' : 'GenLayer-ready prototype')}</p></div>
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
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">{zh ? 'AI Agent 收入验证与欺诈判断' : 'AI agent revenue verification'}</p>
          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.04em] sm:text-6xl">{zh ? '信任一个 Agent 前，先核验它的收入声明。' : 'Check an agent’s revenue claims before you trust them.'}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">{zh ? '核对公开付款证据、钱包关联线索，并准备可解释的 GenLayer 共识裁决——不会把每一笔转账都冒充收入。' : 'Public payment evidence, wallet-link clues, and an explainable GenLayer consensus verdict—without pretending that every transfer is income.'}</p>
        </div>

        {canDeployUpgrade && contractPolicyVersion !== currentPolicyVersion && <section className="panel mb-8 border-violet-300/20 p-6 sm:p-7">
          <p className="section-label text-violet-200">{zh ? 'Studio Next 合约已准备好' : 'Studio Next contract ready'}</p>
          <h2 className="mt-2 text-xl font-semibold">{zh ? '部署比赛要求的正式分析合约' : 'Deploy the hackathon-ready analysis contract'}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{zh ? '合约将部署到比赛指定的 Studio Next（Chain ID 61997），并使用官方 Transaction Kit 读取实时费用。它会针对每个地址生成具体结论，再由其他验证者核对结论是否忠于链上证据。最终交易仍需由你在钱包中亲自确认。' : 'The contract will deploy to the required Studio Next network (chain ID 61997) with live fees from the official Transaction Kit. It produces a case-specific conclusion and validators check that it is grounded in the evidence. You still approve the final transaction in your wallet.'}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => void deployToGenLayer()} disabled={['connecting', 'submitting', 'waiting'].includes(deployStatus)} className="bg-violet-200 text-violet-950 hover:bg-violet-100">
              {deployStatus === 'connecting' ? (zh ? '正在切换 Studio Next…' : 'Switching to Studio Next…') : deployStatus === 'submitting' ? (zh ? '请在钱包核对费用并确认…' : 'Review the fee and confirm in wallet…') : deployStatus === 'waiting' ? (zh ? '等待 Studio Next 完成共识…' : 'Waiting for Studio Next consensus…') : (zh ? '部署 Studio Next 合约' : 'Deploy to Studio Next')}
            </Button>
            {deployTxHash && <a className="break-all font-mono text-[10px] text-violet-200 hover:text-violet-100" href={`${genLayerExplorerUrl}tx/${deployTxHash}`} target="_blank" rel="noreferrer">{zh ? '部署交易：' : 'Deployment: '}{deployTxHash}</a>}
          </div>
          {deployError && <p role="alert" className="mt-3 rounded-xl border border-red-300/20 bg-red-300/8 p-3 text-xs leading-5 text-red-200">{deployError}</p>}
        </section>}

        <form onSubmit={runCheck} className="search-shell mb-10 flex flex-col gap-3 p-2 sm:flex-row">
          <Input required autoComplete="off" spellCheck={false} aria-label={zh ? 'Agent 钱包地址' : 'Agent wallet address'} value={wallet} onChange={(event) => setWallet(event.target.value)} className="h-12 flex-1 border-0 bg-transparent px-4 font-mono text-sm focus-visible:ring-0" placeholder={zh ? '输入 Base 上的 Agent 钱包地址' : 'Enter an Agent wallet on Base'} />
          <Button type="submit" size="lg" disabled={verificationBusy} className="h-12 rounded-xl bg-white px-5 text-black hover:bg-white/85">{verificationBusy ? <><LoaderCircle className="animate-spin" /> {zh ? '正在完成验证…' : 'Completing verification…'}</> : <>{zh ? '验证 Agent' : 'Verify agent'} <ArrowRight /></>}</Button>
        </form>

        {verificationBusy && <section className="panel mb-8 p-6 sm:p-7" aria-live="polite">
          <div className="flex items-start gap-4">
            <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border border-violet-300/20 bg-violet-300/8"><LoaderCircle className="size-5 animate-spin text-violet-200" /></div>
            <div className="min-w-0">
              <p className="section-label">{zh ? '正在完成整套验证' : 'Completing the full verification'}</p>
              <h2 className="mt-2 text-xl font-semibold">{workflowStatus === 'scanning'
                ? (checkingLinkage ? (zh ? '正在检查付款钱包之间的资金关联' : 'Checking financial links among payer wallets') : (zh ? '正在更新收入账本并整理结算证据' : 'Updating the income ledger and assembling settlement evidence'))
                : workflowStatus === 'wallet'
                  ? (zh ? '证据已经准备好，请选择钱包并确认交易' : 'Evidence is ready. Choose a wallet and confirm the transaction')
                  : workflowStatus === 'submitting'
                    ? (zh ? '请在钱包中确认 GenLayer 判断交易' : 'Confirm the GenLayer judgment transaction in your wallet')
                    : (zh ? '交易已提交，正在等待 GenLayer 完成判断' : 'Transaction submitted; waiting for GenLayer to finish the judgment')}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{zh ? '结论和证据不会分批出现。等数据扫描、钱包确认和 GenLayer 判断全部完成后，页面会先显示 GenLayer 的明确结论，再一次性显示证据、分数和凭证资格。' : 'No partial result is shown. After data scanning, wallet confirmation, and the GenLayer judgment all finish, the page shows the GenLayer verdict first, followed by the evidence, scores, and credential eligibility together.'}</p>
              {workflowStatus === 'consensus' && <p className="mt-2 max-w-3xl text-sm leading-6 text-violet-200">{zh ? '通常约需 1–3 分钟；测试网繁忙时可能需要约 5 分钟。交易编号出现后请耐心等待，不要重复提交。' : 'This usually takes 1–3 minutes and may take about 5 minutes when the test network is busy. Once a transaction number appears, please wait instead of submitting again.'}</p>}
              {workflowStatus === 'wallet' && <Button type="button" onClick={() => setWalletDialogOpen(true)} className="mt-4 bg-violet-200 text-violet-950 hover:bg-violet-100"><WalletCards />{zh ? '选择钱包继续' : 'Choose wallet to continue'}</Button>}
              {chainTxHash && <a className="mt-3 inline-flex break-all font-mono text-[10px] text-violet-200 hover:text-violet-100" href={`${genLayerExplorerUrl}tx/${chainTxHash}`} target="_blank" rel="noreferrer">{zh ? '交易编号：' : 'Transaction: '}{chainTxHash}</a>}
            </div>
          </div>
        </section>}

        {error && <p role="alert" className="mb-6 rounded-xl border border-red-300/20 bg-red-300/8 px-4 py-3 text-sm text-red-200">{error}</p>}

        {workflowStatus === 'error' && chainError && <div className="mb-8 rounded-xl border border-red-300/20 bg-red-300/8 p-4 text-sm text-red-100"><p>{chainError}</p>{chainTxHash && <a className="mt-3 block break-all font-mono text-[10px] text-red-100 underline decoration-red-200/40 underline-offset-4" href={`${genLayerExplorerUrl}tx/${chainTxHash}`} target="_blank" rel="noreferrer">{zh ? '查看失败交易：' : 'Inspect failed transaction: '}{chainTxHash}</a>}{canContinuePendingVerification && <Button type="button" onClick={continuePendingVerification} variant="outline" className="mt-4 border-red-200/20 bg-black/10 text-white hover:bg-black/20">{zh ? '继续跟踪原交易' : 'Continue tracking the original transaction'}</Button>}</div>}

        {resultsReady && <div ref={resultsRef} className="scroll-mt-6"><>
        {checkedWallet && <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-xs text-muted-foreground">{zh ? '已验证地址' : 'Verified address'}</p><p className="mt-1 max-w-[78vw] truncate font-mono text-sm text-white">{checkedWallet}</p></div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_#34d399]" />{zh ? '证据来自公开数据源' : 'Evidence fetched from public sources'}</div>
        </div>}

        {chainJudgment && <ChainJudgmentPanel judgment={chainJudgment} payments={payments} indicators={indicators} walletLinksChecked={Boolean(linkage)} integrity={integrity} reasonCodes={chainReasonCodes} points={chainPoints} zh={zh} />}

        <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
          <section className="panel p-6 sm:p-7">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div><p className="section-label">{zh ? '证据与评分细节' : 'Evidence and score details'}</p><h2 className={`mt-2 text-2xl font-semibold tracking-tight ${integrity?.provenWashTrader || Number(chainJudgment?.self_payment_risk ?? 0) >= 70 ? 'text-red-300' : ''}`}>{!evidence?.found ? (zh ? '没有找到买方签名的 AntSeed 付款记录' : 'No buyer-signed AntSeed payment was found') : (zh ? '已读取买方签名付款记录' : 'Buyer-signed payment records loaded')}</h2></div>
              <div className="score-ring"><span className={positiveScoreClass(chainJudgment?.income_credibility)}>{chainJudgment?.income_credibility ?? '—'}</span><small>{zh ? '链上评分' : 'onchain'}</small></div>
            </div>
            <p className="max-w-2xl leading-7 text-muted-foreground">{zh ? plainChineseSummary(payments, indicators, checkingLinkage, integrity) : (assessment?.explanation ?? 'Buyer-approved payment evidence was found.')}</p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label={zh ? '收入记录可信度' : 'Revenue evidence'} value={formatScore(chainJudgment?.income_credibility, zh)} valueClassName={positiveScoreClass(chainJudgment?.income_credibility)} /><Metric label={zh ? '欺诈风险' : 'Fraud risk'} value={formatScore(chainJudgment?.self_payment_risk, zh)} valueClassName={riskScoreClass(chainJudgment?.self_payment_risk)} /><Metric label={zh ? '证据充分程度' : 'Evidence sufficiency'} value={formatScore(chainJudgment?.evidence_sufficiency, zh)} valueClassName={positiveScoreClass(chainJudgment?.evidence_sufficiency)} /><Metric label={zh ? '买方签名付款率' : 'Buyer-signed payment rate'} value={formatPercent(lifecycle?.buyerAcceptanceRate, '—')} valueClassName="text-violet-200" /></div>
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
                <Badge variant="outline" className="border-emerald-300/25 text-emerald-200">{zh ? 'GenLayer 已完成判断' : 'GenLayer judgment complete'}</Badge>
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
              <p className="section-label">{zh ? '链上记录与收入凭证' : 'Onchain record and revenue credential'}</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight">{zh ? '这次判断已经写入 GenLayer 合约' : 'This judgment is stored in the GenLayer contract'}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{zh ? '上方是 GenLayer 给出的最终结论；这里保留报告编号、合约地址和交易记录。符合条件时，被验证地址的主人可以在最下方领取链上收入凭证。' : 'The final GenLayer verdict appears above. This section keeps the report ID, contract address, and transaction record. When eligible, the owner of the assessed address can claim an onchain revenue credential below.'}</p>
            </div>
            <Badge variant="outline" className="w-fit border-emerald-300/25 bg-emerald-300/8 text-emerald-200">{zh ? 'GenLayer 判断完成' : 'GenLayer judgment complete'}</Badge>
          </div>
          <div className="mt-5 rounded-xl border border-white/8 bg-black/20 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{zh ? '报告编号' : 'Report ID'}</p>
            <p className="mt-2 break-all font-mono text-xs text-white">{reportId}</p>
          </div>
          <div className="mt-3 rounded-xl border border-emerald-300/15 bg-emerald-300/5 p-4">
            <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-200/75">{zh ? '合约地址' : 'Contract address'}</p>
            <p className="mt-2 break-all font-mono text-xs text-white">{contractAddress}</p>
            <a className="mt-3 inline-flex items-center gap-1.5 text-xs text-emerald-300 hover:text-emerald-200" href={contractExplorerUrl} target="_blank" rel="noreferrer">{zh ? '在 GenLayer 浏览器查看' : 'View in GenLayer Explorer'} <ExternalLink className="size-3" /></a>
          </div>
          {chainTxHash && <a className="mt-3 inline-flex break-all font-mono text-[10px] text-violet-200 hover:text-violet-100" href={`${genLayerExplorerUrl}tx/${chainTxHash}`} target="_blank" rel="noreferrer">{zh ? '交易编号：' : 'Transaction: '}{chainTxHash}</a>}
          {chainNotice && <p className="mt-3 rounded-xl border border-sky-300/20 bg-sky-300/7 p-3 text-xs leading-5 text-sky-100">{chainNotice}</p>}
          {hasCredentialRegistry && chainJudgment && <section className="credential-panel mt-4 p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2"><Fingerprint className="size-5 text-emerald-300" /><p className="section-label text-emerald-200">{zh ? 'ProofRabbit 链上收入凭证' : 'ProofRabbit Revenue Attestation'}</p></div>
                <h3 className="mt-2 text-xl font-semibold">{credential ? (zh ? '这份凭证已经绑定到 Agent 钱包' : 'This credential is bound to the agent wallet') : credentialEligible ? (zh ? '这份判断可以领取为链上凭证' : 'This judgment is eligible for an onchain credential') : (zh ? '这份判断不会签发正面收入凭证' : 'This judgment does not qualify for a positive revenue credential')}</h3>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{credential ? (zh ? '凭证不能转让。任何人都可以直接用钱包地址从 GenLayer 合约核验，不需要相信网站截图。' : 'The credential is non-transferable. Anyone can verify it from the GenLayer contract using the wallet address instead of trusting a screenshot.') : credentialEligible ? (zh ? '只有上方被验证的钱包本人可以领取。钱包确认会证明地址归属，不会要求代币授权。' : 'Only the assessed wallet can claim it. The wallet transaction proves address control and never requests a token approval.') : (zh ? '公开判断仍然保留在链上，但高风险、证据不足或没有通过可信度门槛的报告不能包装成正面证明。' : 'The public judgment remains onchain, but a high-risk or insufficient report cannot be packaged as a positive credential.')}</p>
              </div>
              {credential ? <Badge variant="outline" className={credentialStatusClass(credential.status)}><BadgeCheck /> {labelCredentialStatus(credential.status, zh)}</Badge> : credentialEligible ? <Button type="button" onClick={claimRevenueCredential} disabled={['connecting', 'submitting', 'waiting'].includes(claimStatus)} className="w-fit bg-emerald-200 text-emerald-950 hover:bg-emerald-100">{claimStatus === 'connecting' ? (zh ? '正在检查钱包…' : 'Checking wallet…') : claimStatus === 'submitting' ? (zh ? '等待钱包确认…' : 'Confirm in wallet…') : claimStatus === 'waiting' ? (zh ? '正在签发凭证…' : 'Issuing credential…') : (zh ? '领取链上收入凭证' : 'Claim revenue credential')}</Button> : null}
            </div>
            {credential && <div className="mt-5 grid gap-3 md:grid-cols-2">
              <CredentialRow label={zh ? '凭证编号' : 'Credential ID'} value={credential.credential_id ?? '—'} />
              <CredentialRow label={zh ? '绑定钱包' : 'Bound wallet'} value={credential.subject_wallet ?? checkedWallet} />
              <CredentialRow label={zh ? '签发时间' : 'Issued'} value={formatCredentialDate(credential.issued_at, language)} />
              <CredentialRow label={zh ? '有效期至' : 'Valid until'} value={formatCredentialDate(credential.valid_until, language)} />
            </div>}
            {credential && <div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={copyCredentialLink} className="border-emerald-300/20 bg-emerald-300/5 text-emerald-100 hover:bg-emerald-300/10"><Copy />{zh ? '复制公开核验链接' : 'Copy public verification link'}</Button><a className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-4 text-sm text-white hover:bg-white/5" href={`/proof/${checkedWallet}`}>{zh ? '打开链上凭证' : 'Open onchain credential'}<ExternalLink className="size-4" /></a></div>}
            {claimTxHash && <a className="mt-3 inline-flex break-all font-mono text-[10px] text-emerald-200 hover:text-emerald-100" href={`${genLayerExplorerUrl}tx/${claimTxHash}`} target="_blank" rel="noreferrer">{zh ? '凭证交易：' : 'Credential transaction: '}{claimTxHash}</a>}
            {claimError && <p role="alert" className="mt-3 rounded-xl border border-red-300/20 bg-red-300/8 p-3 text-xs leading-5 text-red-200">{claimError}</p>}
            {copyNotice && <p className="mt-3 break-all text-xs text-emerald-200">{copyNotice}</p>}
          </section>}
          {chainError && <p role="alert" className="mt-3 rounded-xl border border-red-300/20 bg-red-300/8 p-3 text-xs leading-5 text-red-200">{chainError}</p>}
          {evidenceJson && <details className="mt-3 rounded-xl border border-white/8 bg-black/15 p-4">
            <summary className="cursor-pointer text-xs font-medium text-violet-200">{zh ? '查看本次链上判断使用的完整证据' : 'Inspect the exact evidence used by this onchain judgment'}</summary>
            <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap break-all text-[10px] leading-5 text-muted-foreground">{publicEvidenceJson(evidenceJson)}</pre>
          </details>}
        </section>
        </></div>}
      </section>
    </main>
  );
}

function Metric({ label, value, valueClassName = 'text-white' }: { label: string; value: string; valueClassName?: string }) { return <div className="metric"><p>{label}</p><strong className={valueClassName}>{value}</strong></div>; }
function Reason({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) { return <div className="reason"><span>{icon}</span><div><h3>{title}</h3><p>{detail}</p></div></div>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="font-mono text-white">{value}</dd></div>; }
function CredentialRow({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/8 bg-black/15 p-4"><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className="mt-2 break-all font-mono text-xs text-white">{value}</p></div>; }

function ChainJudgmentPanel({ judgment, payments, indicators, walletLinksChecked, integrity, reasonCodes, points, zh }: { judgment: any; payments: any; indicators: string[]; walletLinksChecked: boolean; integrity: any; reasonCodes: string[]; points: Array<{ title: string; detail: string }>; zh: boolean }) {
  const tone = chainVerdictTone(judgment?.risk_profile, judgment?.verdict);
  const generated = judgment?.analysis;
  const generatedHeadline = zh ? generated?.headline_zh : generated?.headline_en;
  const generatedSummary = zh ? generated?.summary_zh : generated?.summary_en;
  const generatedPoints = Array.isArray(generated?.findings)
    ? generated.findings.map((finding: any) => ({
        title: zh ? finding.title_zh : finding.title_en,
        detail: zh ? finding.detail_zh : finding.detail_en,
      })).filter((finding: any) => finding.title && finding.detail)
    : [];
  const visiblePoints = generatedPoints.length ? generatedPoints : points;
  return <section className={`mb-4 rounded-2xl border p-6 shadow-2xl shadow-black/25 sm:p-7 ${tone.panel}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className={`section-label ${tone.text}`}>{zh ? 'GenLayer 给出的链上判断' : 'GenLayer onchain judgment'}</p><h2 className={`mt-2 text-2xl font-semibold ${tone.text}`}>{generatedHeadline || labelChainVerdict(judgment.verdict, payments, reasonCodes, zh)}</h2></div>
      <Badge variant="outline" className={tone.badge}>{judgment.policy_version ?? currentPolicyVersion}</Badge>
    </div>
    <p className="mt-4 max-w-4xl text-sm leading-7 text-white/85">{generatedSummary || chainJudgmentSummary(judgment, payments, indicators, walletLinksChecked, integrity, zh)}</p>
    <div className="mt-5 grid gap-3 sm:grid-cols-3">
      <Metric label={zh ? '收入可信度' : 'Income credibility'} value={formatScore(judgment.income_credibility, zh)} valueClassName={positiveScoreClass(judgment.income_credibility)} />
      <Metric label={zh ? '欺诈风险' : 'Fraud risk'} value={formatScore(judgment.self_payment_risk, zh)} valueClassName={riskScoreClass(judgment.self_payment_risk)} />
      <Metric label={zh ? '证据充分程度' : 'Evidence sufficiency'} value={formatScore(judgment.evidence_sufficiency, zh)} valueClassName={positiveScoreClass(judgment.evidence_sufficiency)} />
    </div>
    {visiblePoints.length > 0 && <div className="mt-5"><p className="text-xs font-medium text-white/80">{zh ? '为什么会得出这个结果' : 'Why this result was reached'}</p><div className="mt-3 grid gap-2 lg:grid-cols-3">{visiblePoints.map((point: any) => <div key={point.title} className="rounded-lg border border-white/8 bg-black/15 p-4"><p className="text-xs font-medium text-white/90">{point.title}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{point.detail}</p></div>)}</div></div>}
    {Array.isArray(judgment.cited_wallets) && judgment.cited_wallets.length > 0 && <details className="mt-4 rounded-lg border border-white/8 bg-black/10 p-3"><summary className="cursor-pointer text-xs text-muted-foreground">{zh ? '查看本次判断使用的钱包地址' : 'View wallet addresses used in this answer'}</summary><div className="mt-3">{judgment.cited_wallets.map((address: string) => <p key={address} className="mt-1 break-all font-mono text-[10px] text-white/80">{address}</p>)}</div></details>}
  </section>;
}

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

function pendingTransactionStorageKey(contractAddress: string, reportId: string) {
  return `${pendingTransactionStoragePrefix}:${contractAddress.toLowerCase()}:${reportId}`;
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

async function readStoredCredential(client: any, address: string, subjectWallet: string, transactionHashVariant: any) {
  try {
    const stored = await client.readContract({
      address: address as `0x${string}`,
      functionName: 'get_credential',
      args: [subjectWallet],
      transactionHashVariant: transactionHashVariant.LATEST_NONFINAL,
    });
    if (!stored) return null;
    return typeof stored === 'string' ? JSON.parse(stored) : stored;
  } catch (caught) {
    const text = genLayerErrorSearchText(caught);
    if (/credential not found|function.*not found|unknown function/i.test(text)) return null;
    throw caught;
  }
}

function isCredentialEligible(judgment: any) {
  return Boolean(judgment) &&
    (judgment.risk_profile === 'no_fraud_signals' || (!judgment.risk_profile && judgment.verdict === 'no_wash_evidence')) &&
    Number(judgment.income_credibility ?? 0) >= 70 &&
    Number(judgment.self_payment_risk ?? 100) <= 30 &&
    Number(judgment.evidence_sufficiency ?? 0) >= 70;
}

function labelCredentialStatus(status: string | undefined, zh: boolean) {
  const labels: Record<string, [string, string]> = {
    active: ['有效', 'Active'],
    expired: ['已过期', 'Expired'],
    revoked: ['已撤销', 'Revoked'],
    superseded: ['已被新版替代', 'Superseded'],
  };
  return labels[status ?? '']?.[zh ? 0 : 1] ?? (zh ? '状态未知' : 'Unknown');
}

function credentialStatusClass(status: string | undefined) {
  if (status === 'active') return 'border-emerald-300/25 bg-emerald-300/8 text-emerald-200';
  if (status === 'expired' || status === 'superseded') return 'border-amber-300/25 bg-amber-300/8 text-amber-200';
  return 'border-red-300/25 bg-red-300/8 text-red-200';
}

function formatCredentialDate(value: number | string | undefined, language: 'zh' | 'en') {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  return new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(new Date(seconds * 1000));
}

function genLayerErrorSearchText(caught: unknown) {
  const error = caught as {
    message?: unknown;
    details?: unknown;
    shortMessage?: unknown;
    cause?: { message?: unknown; data?: unknown };
  } | null;
  const parts = [error?.message, error?.details, error?.shortMessage, error?.cause?.message].filter((value): value is string => typeof value === 'string');
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
  const receiptResult = typeof data === 'object' && data !== null && 'receipt' in data
    ? (data as { receipt?: { result?: unknown } }).receipt?.result
    : null;
  if (typeof receiptResult === 'string') {
    try {
      const decoded = /^[0-9a-fA-F]+$/.test(receiptResult) && receiptResult.length % 2 === 0
        ? new TextDecoder().decode(new Uint8Array(receiptResult.match(/.{2}/g)?.map((byte) => Number.parseInt(byte, 16)) ?? []))
        : atob(receiptResult);
      parts.push(decoded.replace(/[\x00-\x1f]/g, ' ').trim());
    } catch {
      parts.push(receiptResult);
    }
  }
  return parts.join(' ');
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
  if (/LEGACY_CONTRACT|CREDENTIAL_UPGRADE_REQUIRED/i.test(message)) {
    return zh ? '当前连接的是旧版合约。为避免旧规则继续产生不稳定结果，网页已停止发送交易；请刷新页面并部署新版合约。' : 'The connected contract is outdated. The site stopped before sending a transaction; refresh and deploy the current contract version.';
  }
  if (/NOT_VOTED/i.test(message)) {
    return zh ? '交易已经发到链上，但 GenLayer 验证者没有为这次判断形成有效投票结果。交易可能已经消耗测试币；请先查看交易详情，不要直接重复提交。' : 'The transaction was submitted, but GenLayer validators did not produce a valid vote for this judgment. Test tokens may already have been spent; inspect the transaction before retrying.';
  }
  if (/UNDETERMINED|did not reach agreement/i.test(message)) {
    return zh ? '本次验证流程已经结束，但验证者没有达成一致，因此没有产生正式判断。请先查看交易详情，不要立即重复提交。' : 'This validation round ended without validator agreement, so no formal judgment was produced. Inspect the transaction before retrying.';
  }
  if (/NO_CONSENSUS_RESULT/i.test(message)) {
    return zh ? '这笔交易已经结束，但 GenLayer 没有形成可写入合约的最终分析。该报告没有生成结果，也不会被当成有效判断。' : 'The transaction ended without a final GenLayer analysis that could be stored. No valid judgment was created for this report.';
  }
  if (/CONSENSUS_TAKING_LONG/i.test(message)) {
    return zh ? 'GenLayer 已处理超过 12 分钟，网页已停止一直等待，但原交易仍可能在测试网上继续。刷新后会继续跟踪同一笔交易，不会自动重复提交。' : 'GenLayer has been processing for more than 12 minutes. The page stopped waiting, but the original testnet transaction may continue. Refreshing will resume the same transaction instead of submitting a duplicate.';
  }
  if (!wasSubmitted && /network|rpc|fetch|timeout|switch|chain/i.test(message)) {
    return zh ? '钱包或测试网连接暂时中断；交易没有发到链上，也不会扣测试币。请稍后重试。' : 'The wallet or testnet connection was interrupted. Nothing was sent onchain and no test tokens were charged. Please retry.';
  }
  if (!wasSubmitted) {
    return zh ? `交互在发送到链上前停止；不会扣测试币。${message}` : `The interaction stopped before anything was sent onchain, so no test tokens were charged. ${message}`;
  }
  return zh ? `交易已经发到链上，但执行没有完成。请先用上方交易编号查看详情，不要立即重复提交。${message}` : `The transaction was submitted but did not finish. Inspect the transaction above before retrying. ${message}`;
}

function chainVerdictTone(riskProfile?: string, verdict?: string) {
  if (riskProfile === 'fraud_detected' || verdict === 'wash_trading' || verdict === 'high_risk') return { panel: 'border-red-300/25 bg-red-300/6', text: 'text-red-300', badge: 'border-red-300/25 text-red-200' };
  if (riskProfile === 'risk_factors' || riskProfile === 'no_payment_history' || verdict === 'mixed' || verdict === 'insufficient_evidence') return { panel: 'border-amber-300/25 bg-amber-300/6', text: 'text-amber-300', badge: 'border-amber-300/25 text-amber-200' };
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
