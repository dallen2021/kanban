import type { ReactElement } from "react";

export default function App(): ReactElement {
	return (
		<main
			style={{
				minHeight: "100vh",
				background: "#0d1117",
				color: "#e6edf3",
				display: "grid",
				placeItems: "center",
				fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
			}}
		>
			<section style={{ textAlign: "center" }}>
				<h1 style={{ margin: 0, fontSize: "20px" }}>Kanbanana Webview</h1>
				<p style={{ marginTop: "8px", color: "#7d8590" }}>
					Clean slate ready for Primer implementation.
				</p>
			</section>
		</main>
	);
}
