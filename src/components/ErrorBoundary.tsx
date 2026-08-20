import React from 'react';
import BrandLogo from './BrandLogo';

type State={error:Error|null};

export default class ErrorBoundary extends React.Component<React.PropsWithChildren,State>{
  state:State={error:null};

  static getDerivedStateFromError(error:Error){
    return {error};
  }

  componentDidCatch(error:Error,info:React.ErrorInfo){
    console.error('Hotel Experience UI error',error,info);
  }

  render(){
    if(this.state.error){
      return <main className="setup-screen">
        <section className="setup-card error-recovery">
          <BrandLogo/>
          <div className="setup-kicker">ERROR DE INTERFAZ</div>
          <h1>La aplicación cargó, pero una pantalla falló.</h1>
          <p className="setup-lead">{this.state.error.message||'Error inesperado.'}</p>
          <button className="primary-button" onClick={()=>window.location.reload()}>Volver a cargar</button>
          <small className="setup-foot">Este mensaje evita que el CRM quede en blanco y facilita identificar el problema.</small>
        </section>
      </main>;
    }
    return this.props.children;
  }
}
