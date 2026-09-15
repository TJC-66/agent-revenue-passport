'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, BadgeCheck, ExternalLink, Fingerprint, LoaderCircle, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GENLAYER_CHAIN, GENLAYER_EXPLORER_URL } from '@/lib/genlayer/network';

const configuredContractAddress = process.env.NEXT_PUBLIC_GENLAYER_CONTRACT_ADDRESS?.trim() ?? '';
const fallbackJudgmentContract = '0x79ab7ac7a17920354547A0B0b1d8f955F76278CC';
const contractStorageKey = 'proofrabbit-genlayer-contract-address-v7-studio-next';
const expectedAttestationVersion = 'proofrabbit-revenue-attestation-v3';
const explorerUrl = GENLAYER_EXPLORER_URL.endsWith('/') ? GENLAYER_EXPLORER_URL : `${GENLAYER_EXPLORER_URL}/`;

export default function ProofPage() {
  const params = useParams<{ wallet: string }>();
  const wallet = decodeURIComponent(params.wallet ?? '').trim();
  const [language, setLanguage] = useState<'zh' | 'en'>('zh');
  const [contractAddress, setContractAddress] = useState(configuredContractAddress || fallbackJudgmentContract);
  const [credential, setCredential] = useState<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'unsupported' | 'error'>('loading');
  const zh = language === 'zh';

  useEffect(() => {
    if (configuredContractAddress) return;
    const saved = window.localStorage.getItem(contractStorageKey)?.trim() ?? '';
    if (/^0x[0-9a-fA-F]{40}$/.test(saved)) setContractAddress(saved);
  }, []);

  useEffect(() => {
    let active = true;
    if (!/^0x[0-9a-fA-F]{40}$/.test(wallet) || !/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
      setStatus('error');
      return;
    }
    setStatus('loading');
    void (async () => {
      try {
        const [{ createClient }, { TransactionHashVariant }] = await Promise.all([
          import('genlayer-js'),
          import('genlayer-js/types'),
        ]);
        const client = createClient({ chain: GENLAYER_CHAIN });
        let version: unknown;
        try {
          version = await client.readContract({
            address: contractAddress as `0x${string}`,
            functionName: 'get_attestation_version',
            args: [],
            transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL,
          });
        } catch {
          if (active) setStatus('unsupported');
          return;
        }
        if (version !== expectedAttestationVersion) {
          if (active) setStatus('unsupported');
          return;
        }
        const stored = await client.readContract({
          address: contractAddress as `0x${string}`,
          functionName: 'get_credential',
          args: [wallet],
          transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL,
        });
        if (!active) return;
        if (!stored) {
          setStatus('missing');
          return;
        }
        const parsed = typeof stored === 'string' ? JSON.parse(stored) : stored;
        setCredential(parsed);
        setStatus(parsed ? 'ready' : 'missing');
      } catch {
        if (active) setStatus('error');
      }
    })();
    return () => { active = false; };
  }, [contractAddress, wallet]);

  const active = credential?.status === 'active';

  return <main className="min-h-screen bg-background text-foreground">
    <header className="border-b border-white/8">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5">
        <a href="/" className="flex items-center gap-3">
          <img src="/proofrabbit-logo.png" alt="ProofRabbit" className="size-9 rounded-xl object-cover" />
          <div><p className="text-sm font-semibold">ProofRabbit <span className="font-normal text-muted-foreground">证明兔</span></p><p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{zh ? '链上收入凭证' : 'Onchain revenue credential'}</p></div>
        </a>
        <div className="flex rounded-lg border border-white/10 bg-white/[0.04] p-1 text-xs"><button type="button" onClick={() => setLanguage('zh')} className={`rounded-md px-2.5 py-1.5 ${zh ? 'bg-white text-black' : 'text-muted-foreground'}`}>中文</button><button type="button" onClick={() => setLanguage('en')} className={`rounded-md px-2.5 py-1.5 ${!zh ? 'bg-white text-black' : 'text-muted-foreground'}`}>English</button></div>
      </div>
    </header>

    <section className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
      <a href="/" className="mb-7 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white"><ArrowLeft className="size-4" />{zh ? '返回地址验证' : 'Back to address verification'}</a>
      {status === 'loading' && <div className="panel flex min-h-64 items-center justify-center gap-3 p-8 text-muted-foreground"><LoaderCircle className="animate-spin text-violet-300" />{zh ? '正在直接读取 GenLayer 合约…' : 'Reading the GenLayer contract directly…'}</div>}
      {status !== 'loading' && status !== 'ready' && <div className="panel p-8 sm:p-10"><TriangleAlert className="size-8 text-amber-300" /><h1 className="mt-5 text-2xl font-semibold">{status === 'missing' ? (zh ? '这个钱包还没有 ProofRabbit 收入凭证' : 'This wallet has no ProofRabbit revenue credential') : status === 'unsupported' ? (zh ? '当前合约还不是凭证版本' : 'The current contract is not the credential registry') : (zh ? '暂时无法读取这份凭证' : 'This credential cannot be read right now')}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{zh ? '公开报告和链上凭证是两件事。只有钱包本人完成领取后，这里才会显示一份绑定钱包、不可转让且带有效期的证明。' : 'A public report and an onchain credential are different. This page shows a wallet-bound, non-transferable, expiring credential only after the wallet owner claims it.'}</p></div>}

      {status === 'ready' && credential && <article className={`credential-panel overflow-hidden p-7 sm:p-10 ${active ? '' : 'opacity-90'}`}>
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div><div className="flex items-center gap-2 text-emerald-300"><Fingerprint className="size-5" /><p className="text-xs font-semibold uppercase tracking-[0.18em]">ProofRabbit Revenue Attestation</p></div><h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{zh ? 'AI Agent 收入可信凭证' : 'AI Agent Revenue Credential'}</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">{zh ? '这份记录由 ProofRabbit 整理公开结算证据，经 GenLayer 判断后写入链上。它绑定下方钱包，不能转让。' : 'ProofRabbit assembled the public settlement evidence and GenLayer judged the result before it was written onchain. It is bound to the wallet below and cannot be transferred.'}</p></div>
          <Badge variant="outline" className={statusClass(credential.status)}>{active ? <BadgeCheck /> : <TriangleAlert />}{statusLabel(credential.status, zh)}</Badge>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3"><Score label={zh ? '收入可信度' : 'Income credibility'} value={credential.income_credibility} positive /><Score label={zh ? '欺诈风险' : 'Fraud risk'} value={credential.self_payment_risk} positive={false} /><Score label={zh ? '证据充分程度' : 'Evidence sufficiency'} value={credential.evidence_sufficiency} positive /></div>
        <div className="mt-8 grid gap-3 md:grid-cols-2">
          <Field label={zh ? '绑定钱包' : 'Bound wallet'} value={credential.subject_wallet} />
          <Field label={zh ? '凭证编号' : 'Credential ID'} value={credential.credential_id} />
          <Field label={zh ? '签发时间' : 'Issued'} value={dateLabel(credential.issued_at, language)} />
          <Field label={zh ? '有效期至' : 'Valid until'} value={dateLabel(credential.valid_until, language)} />
          <Field label={zh ? '证据摘要' : 'Evidence digest'} value={credential.evidence_digest} />
          <Field label={zh ? '数据范围' : 'Source scope'} value={(credential.source_scope ?? []).join(' · ') || '—'} />
        </div>
        <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-white/8 pt-6"><ShieldCheck className="size-5 text-emerald-300" /><p className="text-xs leading-5 text-muted-foreground">{zh ? '本页直接读取 GenLayer 合约状态，不依赖截图。合约地址和凭证内容都可以独立核验。' : 'This page reads GenLayer contract state directly instead of relying on a screenshot. The contract and credential contents can be independently verified.'}</p></div>
        <div className="mt-4 flex flex-wrap gap-2"><a className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 px-4 text-sm text-white hover:bg-white/5" href={`${explorerUrl}address/${contractAddress}`} target="_blank" rel="noreferrer">{zh ? '查看签发合约' : 'View issuer contract'}<ExternalLink className="size-4" /></a><Button type="button" variant="outline" className="border-white/10 bg-white/[0.03]" onClick={() => navigator.clipboard.writeText(window.location.href)}>{zh ? '复制当前链接' : 'Copy this link'}</Button></div>
      </article>}
    </section>
  </main>;
}

function Score({ label, value, positive }: { label: string; value: number; positive: boolean }) {
  const number = Number(value ?? 0);
  const className = positive ? (number >= 70 ? 'text-emerald-300' : number >= 40 ? 'text-amber-300' : 'text-red-300') : (number >= 70 ? 'text-red-300' : number >= 40 ? 'text-amber-300' : 'text-emerald-300');
  return <div className="metric"><p>{label}</p><strong className={className}>{number}/100</strong></div>;
}

function Field({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/8 bg-black/15 p-4"><p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p><p className="mt-2 break-all font-mono text-xs text-white">{value || '—'}</p></div>; }
function statusLabel(status: string, zh: boolean) { return ({ active: zh ? '有效' : 'Active', expired: zh ? '已过期' : 'Expired', revoked: zh ? '已撤销' : 'Revoked', superseded: zh ? '已被新版替代' : 'Superseded' } as Record<string, string>)[status] ?? (zh ? '未知' : 'Unknown'); }
function statusClass(status: string) { return status === 'active' ? 'border-emerald-300/25 bg-emerald-300/8 text-emerald-200' : status === 'revoked' ? 'border-red-300/25 bg-red-300/8 text-red-200' : 'border-amber-300/25 bg-amber-300/8 text-amber-200'; }
function dateLabel(value: number | string, language: 'zh' | 'en') { const seconds = Number(value); return Number.isFinite(seconds) && seconds > 0 ? new Intl.DateTimeFormat(language === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(seconds * 1000)) : '—'; }
