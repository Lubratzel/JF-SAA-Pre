<script>
  import { goto } from '$app/navigation';
  import '@fortawesome/fontawesome-free/css/all.min.css'

  export let name = 'Jugendfeuerwehr Münchweiler';

  const gotoVehicles = () => {
    goto('/Fahrzeuge');
  }

  
  const gotoTest = () => {
    goto('/MissionView');
  }



  const gotoHome = () => {
    goto('/');
  }



    function gotoSettings() {
      goto('/settings');
    }
</script>


<div class="sidebar">
<h1>{name}</h1>
  <div class="menu">
    <div class="menu-item" on:click={() => gotoHome()}>
        <i class="fa-solid fa-house"></i>
          <span>Home</span>
      </div>
      <div class="menu-item" on:click={() => gotoVehicles()}>
        <i class="fa-solid fa-car"></i>
          <span>Fahrzeuge</span>
      </div>
      <div class="menu-item" on:click={() => gotoSettings()}>
        <i class="fa-solid fa-gear"></i>
          <span>Einstellungen</span>
      </div>
     

  </div>
</div>

<style lang="scss">
    .sidebar {
        height: 100vh;
        width: 250px;
        background-color: #b71c1c;
        display: flex;
        flex-direction: column;
        padding: 20px;
        color: white;
        font-family: sans-serif;
        overflow: hidden;
    
        h1 {
            margin: 0;
            font-size: 1.5em;
        }
    
        .menu {
            margin-top: 100px;
            flex-grow: 1;
    
            .menu-item {
                display: flex;
                align-items: center;
                margin-top: 20px;
                cursor: pointer;
    
                i {
                    margin-right: 20px;
                }
    
                span {
                    font-size: 1em;
                    position: relative;
    
                    &::after {
                        content: '';
                        position: absolute;
                        left: 0;
                        bottom: -5px;
                        width: 100%;
                        height: 2px;  
                        background-color: white;
                        transform: scaleX(0);  
                        transform-origin: left;
                        transition: transform 0.2s ease;  
                    }
                }
    
                &:hover span::after {
                    transform: scaleX(1.1);  
                  
                }
            }
        }
    }
    
    
</style>    