import { useEffect, useState } from "react"

const IPFS_GATEWAYS = [
	"https://cloudflare-ipfs.com/ipfs/",
	"https://dweb.link/ipfs/",
	"https://infura-ipfs.io/ipfs/",
	"https://gateway.pinata.cloud/ipfs/",
]

function parseCid(raw) {
	if (!raw) return null
	if (raw.startsWith("ipfs://")) return raw.replace("ipfs://", "")
	if (raw.includes("/ipfs/")) return raw.split("/ipfs/")[1] || null
	return null // plain http / https
}

function buildList(raw) {
	const cid = parseCid(raw)
	return cid ? IPFS_GATEWAYS.map((gw) => gw + cid) : [raw]
}

/** Returns { src, loaded, onError, onLoad }  */
export default function useIpfsImg(rawUrl) {
	const [list, setList] = useState([])
	const [idx, setIdx] = useState(0)
	const [loaded, setLoad] = useState(false)

	useEffect(() => {
		if (rawUrl) {
			setList(buildList(rawUrl))
			setIdx(0)
			setLoad(false)
		}
	}, [rawUrl])

	const onError = () => idx < list.length - 1 && setIdx((i) => i + 1)
	const onLoad = () => setLoad(true)

	return { src: list[idx], loaded, onError, onLoad }
}
