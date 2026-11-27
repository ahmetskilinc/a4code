// The production icon, as GitHub shows the a4code app, whatever this build's channel.
import appIconUrl from "../../../../assets/prod/a4-black-web-apple-touch-180.png";

export function A4AppIcon(props: { readonly className?: string }) {
  return <img src={appIconUrl} alt="" className={props.className} />;
}
